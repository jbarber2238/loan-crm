"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { dealClientNeeds, deals, products, termSheets } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { sendGmailAs } from "@/server/gmail/send";
import { extractTermSheetFields } from "@/lib/term-sheet-fields";
import { createDocumentFromPdfUrl, waitUntilDraft, sendDocumentForSignature } from "@/server/pandadoc";
import { syncProcessingFeeInvoice, sendProcessingFeeInvoiceEmail } from "@/server/billing";
import { conservativeValueBasis, calculateLtarv, calculateLtc } from "@/lib/term-sheet-calculations";
import { getCompanyName, getCompanyLogoHtml } from "@/server/settings";
import { getUserEmailSignatureHtml } from "@/server/users";
import { buildBorrowerEmail } from "@/server/borrower-templates";
import { plainTextToHtmlWithBlocks, htmlButton } from "@/lib/email-html";
import {
  resolveTermSheetReadyTemplateKey,
  summarizeTermSheetsForBorrowerEmail,
  buildTermSheetButtonLabels,
  buildRateBreakdownHtml,
} from "@/server/term-sheet-summary";
import { populateClientNeedsFromProduct } from "@/server/actions/client-needs";
import { getEmailRecipientCandidates } from "@/server/email-recipient-candidates";
import { advanceDealStage } from "@/server/actions/deals";

export async function createTermSheet(dealId: string, formData: FormData) {
  const user = await requireUser();
  const productId = formData.get("productId");
  if (typeof productId !== "string" || !productId) throw new Error("A product is required");

  const product = await db.query.products.findFirst({ where: eq(products.id, productId) });
  if (!product) throw new Error("Product not found");

  const fields = extractTermSheetFields(formData, product.category, user.isAdmin);

  const [termSheet] = await db
    .insert(termSheets)
    .values({
      dealId,
      lenderId: product.lenderId,
      productId,
      fields,
      status: "draft",
      createdBy: user.id,
    })
    .returning({ id: termSheets.id });

  revalidatePath(`/deals/${dealId}`);
  return termSheet.id;
}

export async function updateTermSheetFields(
  dealId: string,
  termSheetId: string,
  formData: FormData
) {
  const user = await requireUser();

  const termSheet = await db.query.termSheets.findFirst({
    where: eq(termSheets.id, termSheetId),
    with: { product: true },
  });
  if (!termSheet) throw new Error("Term sheet not found");

  const fields = extractTermSheetFields(formData, termSheet.product.category, user.isAdmin);

  await db.update(termSheets).set({ fields }).where(eq(termSheets.id, termSheetId));

  revalidatePath(`/deals/${dealId}`);
}

export async function generateTermSheet(dealId: string, termSheetId: string) {
  const user = await requireUser();
  await db
    .update(termSheets)
    .set({ status: "generated", pdfUrl: `/api/term-sheets/${termSheetId}/pdf` })
    .where(eq(termSheets.id, termSheetId));

  // No-op if the deal isn't currently at Rate Shopping (e.g. a later term
  // sheet generated after the deal's already moved on).
  await advanceDealStage(dealId, "rate_shopping", "term_sheet", user.id);

  revalidatePath(`/deals/${dealId}`);
}

function summarizeTerms(fields: Record<string, unknown>) {
  const parts = [
    fields.loanAmount ? `$${Number(fields.loanAmount).toLocaleString("en-US")}` : null,
    fields.interestRate ? `@ ${fields.interestRate}%` : null,
    fields.loanTermMonths
      ? `${fields.loanTermMonths}mo term`
      : fields.loanTermYears
        ? `${fields.loanTermYears}yr term`
        : null,
    fields.amortizationType ? String(fields.amortizationType) : null,
  ].filter(Boolean);
  return parts.join(", ") || "See term sheet for details";
}

// The actual acceptance logic, split out from the auth-gated action below so
// the PandaDoc webhook (no user session — see
// src/app/api/webhooks/pandadoc/route.ts) can trigger the exact same
// promote-fields-to-the-deal behavior when a term sheet comes back signed,
// instead of duplicating it.
export async function performTermSheetAcceptance(dealId: string, termSheetId: string) {
  const [termSheet, deal] = await Promise.all([
    db.query.termSheets.findFirst({ where: eq(termSheets.id, termSheetId) }),
    db.query.deals.findFirst({ where: eq(deals.id, dealId) }),
  ]);
  if (!termSheet) throw new Error("Term sheet not found");
  if (!deal) throw new Error("Deal not found");

  await db
    .update(termSheets)
    .set({ status: "accepted", acceptedAt: new Date() })
    .where(eq(termSheets.id, termSheetId));

  const rateValue = termSheet.fields.interestRate;
  const loanAmountValue = termSheet.fields.loanAmount;
  const costToBorrowerFeeValue = termSheet.fields.costToBorrowerFee;
  const originationPointsValue = termSheet.fields.originationPoints;
  const rateBuydownPointsValue = termSheet.fields.rateBuydownPoints;
  const amortizationTypeValue = termSheet.fields.amortizationType;
  const loanTermYearsValue = termSheet.fields.loanTermYears;
  const loanTermMonthsValue = termSheet.fields.loanTermMonths;
  const approvedRehabCostValue = termSheet.fields.approvedRehabCost;
  const approvedArvValue = termSheet.fields.approvedArv;
  const initialAdvanceValue = termSheet.fields.initialAdvance;
  const interestTypeValue = termSheet.fields.interestType;

  // No appraisal in yet at acceptance time, so the initial LTV/LTC uses the
  // same conservative basis (lower of purchase price / as-is value) the deal
  // header shows pre-acceptance — the LTV-based-on-purchase-price toggle and
  // appraised value stay at their defaults until an appraisal comes back.
  // Same story for LTARV: it starts from the lender-quoted approvedArv until
  // the appraised ARV comes in and the ltarvBasedOnApprovedArv toggle is
  // switched off.
  const valueBasis = conservativeValueBasis(
    deal.loanCategory,
    deal.purchasePrice ? Number(deal.purchasePrice) : null,
    deal.estimatedAsIsValue ? Number(deal.estimatedAsIsValue) : null
  );
  const approvedLtv =
    typeof loanAmountValue === "number" && valueBasis ? (loanAmountValue / valueBasis) * 100 : null;
  const approvedLtarv =
    typeof loanAmountValue === "number" && typeof approvedArvValue === "number"
      ? calculateLtarv(loanAmountValue, approvedArvValue)
      : null;
  const approvedLtc =
    typeof loanAmountValue === "number"
      ? calculateLtc(
          loanAmountValue,
          valueBasis,
          typeof approvedRehabCostValue === "number" ? approvedRehabCostValue : null
        )
      : null;

  await db
    .update(deals)
    .set({
      lenderId: termSheet.lenderId,
      productId: termSheet.productId,
      finalRate: typeof rateValue === "number" ? String(rateValue) : null,
      finalTerms: summarizeTerms(termSheet.fields),
      finalAmortizationType: typeof amortizationTypeValue === "string" && amortizationTypeValue ? amortizationTypeValue : null,
      finalLoanTermYears: typeof loanTermYearsValue === "number" ? loanTermYearsValue : null,
      finalLoanTermMonths: typeof loanTermMonthsValue === "number" ? loanTermMonthsValue : null,
      approvedLoanAmount: typeof loanAmountValue === "number" ? String(loanAmountValue) : null,
      approvedLtv: approvedLtv !== null ? String(approvedLtv) : null,
      approvedRehabCost: typeof approvedRehabCostValue === "number" ? String(approvedRehabCostValue) : null,
      approvedArv: typeof approvedArvValue === "number" ? String(approvedArvValue) : null,
      approvedInitialAdvance: typeof initialAdvanceValue === "number" ? String(initialAdvanceValue) : null,
      interestType: typeof interestTypeValue === "string" && interestTypeValue ? interestTypeValue : null,
      approvedLtarv: approvedLtarv !== null ? String(approvedLtarv) : null,
      approvedLtc: approvedLtc !== null ? String(approvedLtc) : null,
      costToBorrowerFee: typeof costToBorrowerFeeValue === "number" ? String(costToBorrowerFeeValue) : null,
      originationPointsOverride: typeof originationPointsValue === "number" ? String(originationPointsValue) : null,
      rateBuydownPointsOverride: typeof rateBuydownPointsValue === "number" ? String(rateBuydownPointsValue) : null,
      rateLocked: false,
      rateLockedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(deals.id, dealId));

  const existingNeeds = await db.query.dealClientNeeds.findMany({
    where: eq(dealClientNeeds.dealId, dealId),
    columns: { id: true },
  });

  if (existingNeeds.length === 0) {
    await populateClientNeedsFromProduct(dealId, termSheet.productId);
  }

  // At most one term sheet per deal is ever "accepted" — if the borrower
  // opted for a different one than whatever was previously accepted here,
  // that old one is now superseded rather than just silently stale.
  await db
    .update(termSheets)
    .set({ status: "superseded" })
    .where(and(eq(termSheets.dealId, dealId), eq(termSheets.status, "accepted"), ne(termSheets.id, termSheetId)));

  // Creates the processing-fee invoice (or refreshes it if the fee changed
  // and nothing's been paid yet) — see src/server/billing.ts. Never throws:
  // Stripe issues are logged, not surfaced, so they never block acceptance.
  await syncProcessingFeeInvoice(dealId);

  revalidatePath(`/deals/${dealId}`);
}

/**
 * Re-sends Stripe's "you have an invoice" email for the deal's current
 * processing-fee invoice — for when a borrower says a few days later they
 * never got it or lost it. Returns the hosted invoice page URL so it can
 * also be copied and texted directly.
 */
export async function resendProcessingFeeInvoice(dealId: string): Promise<string> {
  await requireUser();
  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    with: { assignedLoanOfficer: { columns: { id: true, name: true, email: true } } },
  });
  if (!deal) throw new Error("Deal not found");
  if (!deal.stripeInvoiceId) throw new Error("No processing-fee invoice has been created for this deal yet");
  if (deal.stripeInvoiceStatus === "paid") throw new Error("This invoice has already been paid");
  if (!deal.stripeInvoiceUrl) throw new Error("No payment link is on file for this invoice");

  await sendProcessingFeeInvoiceEmail(deal, Number(deal.stripeInvoiceAmount), deal.stripeInvoiceUrl);
  return deal.stripeInvoiceUrl;
}

// Sends this specific term sheet's PDF to PandaDoc for the borrower to
// e-sign, using PandaDoc's own delivery email (unlike the client-need
// pandadoc_form flow, there's no borrower-portal page mediating this one —
// the whole point is the borrower gets it immediately, e.g. while still on
// a call). Once they sign, the webhook calls performTermSheetAcceptance
// above automatically — no separate manual "Accept" click needed.
export async function sendTermSheetForSignature(dealId: string, termSheetId: string) {
  await requireUser();

  const [termSheet, deal] = await Promise.all([
    db.query.termSheets.findFirst({ where: eq(termSheets.id, termSheetId) }),
    db.query.deals.findFirst({ where: eq(deals.id, dealId) }),
  ]);
  if (!termSheet) throw new Error("Term sheet not found");
  if (!deal) throw new Error("Deal not found");
  if (!deal.borrowerEmail) throw new Error("This deal has no borrower email on file yet");

  const baseUrl = process.env.APP_URL ?? "";
  const pdfUrl = `${baseUrl}/api/term-sheets/${termSheetId}/pdf?forSignature=1`;
  const [firstName, ...rest] = deal.borrowerName.trim().split(/\s+/);

  const { id } = await createDocumentFromPdfUrl({
    pdfUrl,
    name: `Term Sheet — ${deal.propertyAddress}`,
    recipientEmail: deal.borrowerEmail,
    recipientFirstName: firstName || deal.borrowerName,
    recipientLastName: rest.join(" "),
  });
  await waitUntilDraft(id);
  await sendDocumentForSignature(id);

  await db
    .update(termSheets)
    .set({ pandadocDocumentId: id, pandadocStatus: "document.sent" })
    .where(eq(termSheets.id, termSheetId));

  revalidatePath(`/deals/${dealId}`);
}

/** Renders (but does not send) the "send to borrower" email for a given term-sheet selection. */
export async function previewTermSheetsToBorrowerEmail(dealId: string, termSheetIds: string[]) {
  const user = await requireUser();
  if (!termSheetIds.length) throw new Error("Select at least one term sheet first");

  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    with: { assignedLoanOfficer: true },
  });
  if (!deal?.borrowerEmail) throw new Error("This deal has no borrower email on file");

  const schedulingLink = deal.assignedLoanOfficer?.schedulingLink;
  if (!schedulingLink) {
    throw new Error("The assigned loan officer doesn't have a scheduling link on file yet");
  }

  const selectedTermSheets = await db.query.termSheets.findMany({
    where: inArray(termSheets.id, termSheetIds),
  });

  const baseUrl = process.env.APP_URL ?? "";
  const companyName = await getCompanyName();
  const summary = summarizeTermSheetsForBorrowerEmail(deal, selectedTermSheets);
  const templateKey = resolveTermSheetReadyTemplateKey(deal.loanCategory);

  // termSheetLinks/schedulingLink/rateBreakdown are deliberately left out of
  // `extra` — a borrower should never see the raw internal PDF path (with
  // its UUID) or the giant Google Calendar scheduling URL as literal text.
  // Left un-substituted here, their {{tokens}} survive into
  // plainTextToHtmlWithBlocks below and get swapped for real buttons/a fact
  // list *after* the rest of the template is escaped.
  const [{ subject, body }, signatureHtml, candidates] = await Promise.all([
    buildBorrowerEmail(templateKey, deal, {
      assignedLoanOfficerName: deal.assignedLoanOfficer?.name ?? "",
      companyName,
      senderName: user.name ?? "",
    }),
    getUserEmailSignatureHtml(user.id),
    getEmailRecipientCandidates(dealId, { includeAllStaff: true }),
  ]);

  const buttonLabels = buildTermSheetButtonLabels(deal, selectedTermSheets);
  const termSheetLinksHtml = termSheetIds
    .map((id) => htmlButton(buttonLabels[id] ?? "View term sheet", `${baseUrl}/api/term-sheets/${id}/pdf`))
    .join("<br/><br/>");

  // Rendered to HTML once, here, so the compose dialog can offer real
  // formatting (bold, bullet lists) on top of it — sendTermSheetsToBorrowerEmail
  // sends whatever HTML comes back from that editing, unconverted.
  const htmlBody = plainTextToHtmlWithBlocks(body, {
    termSheetLinks: termSheetLinksHtml,
    schedulingLink: htmlButton("Book a time", schedulingLink),
    rateBreakdown: buildRateBreakdownHtml(templateKey, summary),
  });

  return { subject, body: htmlBody, to: deal.borrowerEmail, cc: "", signatureHtml, candidates };
}

export async function sendTermSheetsToBorrowerEmail(
  dealId: string,
  termSheetIds: string[],
  to: string,
  cc: string,
  subject: string,
  body: string
) {
  const user = await requireUser();
  if (!user.email) throw new Error("Your account has no email on file");
  if (!to.trim()) throw new Error("No recipient on file for this email");
  if (!subject.trim() || !body.trim()) throw new Error("Subject and body can't be empty");

  const [logoHtml, signatureHtml] = await Promise.all([
    getCompanyLogoHtml(),
    getUserEmailSignatureHtml(user.id),
  ]);
  await sendGmailAs(user.id, user.email, {
    to: to.trim(),
    cc: cc.trim() || null,
    subject,
    body: logoHtml + body + signatureHtml,
    html: true,
  });

  if (termSheetIds.length) {
    await db
      .update(termSheets)
      .set({ sentForReviewAt: new Date() })
      .where(inArray(termSheets.id, termSheetIds));
  }

  // No-op if the deal isn't currently at Term Sheet — e.g. a re-send, or
  // "Book a call" already advanced it first.
  await advanceDealStage(dealId, "term_sheet", "negotiation", user.id);

  revalidatePath(`/deals/${dealId}`);
}

/** Renders (but does not send) the "book a call" email. */
export async function previewBookACallEmail(dealId: string) {
  const user = await requireUser();

  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    with: { assignedLoanOfficer: true },
  });
  if (!deal?.borrowerEmail) throw new Error("This deal has no borrower email on file");

  const schedulingLink = deal.assignedLoanOfficer?.schedulingLink;
  if (!schedulingLink) {
    throw new Error("The assigned loan officer doesn't have a scheduling link on file yet");
  }

  const companyName = await getCompanyName();
  const [{ subject, body }, signatureHtml, candidates] = await Promise.all([
    buildBorrowerEmail("borrower_book_a_call", deal, {
      assignedLoanOfficerName: deal.assignedLoanOfficer?.name ?? "",
      companyName,
      senderName: user.name ?? "",
    }),
    getUserEmailSignatureHtml(user.id),
    getEmailRecipientCandidates(dealId, { includeAllStaff: true }),
  ]);

  const htmlBody = plainTextToHtmlWithBlocks(body, {
    schedulingLink: htmlButton("Book a time", schedulingLink),
  });

  return { subject, body: htmlBody, to: deal.borrowerEmail, cc: "", signatureHtml, candidates };
}

export async function sendBookACallEmail(dealId: string, to: string, cc: string, subject: string, body: string) {
  const user = await requireUser();
  if (!user.email) throw new Error("Your account has no email on file");
  if (!to.trim()) throw new Error("No recipient on file for this email");
  if (!subject.trim() || !body.trim()) throw new Error("Subject and body can't be empty");

  const [logoHtml, signatureHtml] = await Promise.all([
    getCompanyLogoHtml(),
    getUserEmailSignatureHtml(user.id),
  ]);
  await sendGmailAs(user.id, user.email, {
    to: to.trim(),
    cc: cc.trim() || null,
    subject,
    body: logoHtml + body + signatureHtml,
    html: true,
  });

  // No-op if the deal isn't currently at Term Sheet — e.g. a re-send, or
  // "Send to borrower" already advanced it first.
  await advanceDealStage(dealId, "term_sheet", "negotiation", user.id);

  revalidatePath(`/deals/${dealId}`);
}
