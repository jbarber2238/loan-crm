"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { dealClientNeeds, deals, products, termSheets } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { sendGmailAs } from "@/server/gmail/send";
import { ADMIN_ONLY_FIELDS, termSheetFieldsFor } from "@/lib/term-sheet-fields";
import { conservativeValueBasis } from "@/lib/term-sheet-calculations";
import { getCompanyName, getDscrCalculatorLink } from "@/server/settings";
import { buildBorrowerEmail } from "@/server/borrower-templates";
import { resolveTermSheetReadyTemplateKey, summarizeTermSheetsForBorrowerEmail } from "@/server/term-sheet-summary";
import { populateClientNeedsFromProduct } from "@/server/actions/client-needs";

function extractFields(formData: FormData, category: string, isAdmin: boolean) {
  const fieldDefs = [...termSheetFieldsFor(category), ...(isAdmin ? ADMIN_ONLY_FIELDS : [])];
  const fields: Record<string, unknown> = {};
  for (const field of fieldDefs) {
    const value = formData.get(field.key);
    if (typeof value === "string" && value.trim().length) {
      const isNumeric = field.type === "number" || field.type === "percent" || field.type === "currency";
      fields[field.key] = isNumeric ? Number(value) : value.trim();
    }
  }
  return fields;
}

export async function createTermSheet(dealId: string, formData: FormData) {
  const user = await requireUser();
  const productId = formData.get("productId");
  if (typeof productId !== "string" || !productId) throw new Error("A product is required");

  const product = await db.query.products.findFirst({ where: eq(products.id, productId) });
  if (!product) throw new Error("Product not found");

  const fields = extractFields(formData, product.category, user.isAdmin);

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

  const fields = extractFields(formData, termSheet.product.category, user.isAdmin);

  await db.update(termSheets).set({ fields }).where(eq(termSheets.id, termSheetId));

  revalidatePath(`/deals/${dealId}`);
}

export async function generateTermSheet(dealId: string, termSheetId: string) {
  await requireUser();
  await db
    .update(termSheets)
    .set({ status: "generated", pdfUrl: `/api/term-sheets/${termSheetId}/pdf` })
    .where(eq(termSheets.id, termSheetId));

  revalidatePath(`/deals/${dealId}`);
}

function summarizeTerms(fields: Record<string, unknown>) {
  const parts = [
    fields.loanAmount ? `$${Number(fields.loanAmount).toLocaleString("en-US")}` : null,
    fields.interestRate ? `@ ${fields.interestRate}%` : null,
    fields.loanTermMonths ? `${fields.loanTermMonths}mo term` : null,
    fields.amortizationType ? String(fields.amortizationType) : null,
  ].filter(Boolean);
  return parts.join(", ") || "See term sheet for details";
}

export async function acceptTermSheet(dealId: string, termSheetId: string) {
  await requireUser();

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
  const amortizationTypeValue = termSheet.fields.amortizationType;
  const loanTermYearsValue = termSheet.fields.loanTermYears;

  // No appraisal in yet at acceptance time, so the initial LTV uses the same
  // conservative basis (lower of purchase price / as-is value) the deal
  // header shows pre-acceptance — the LTV-based-on-purchase-price toggle and
  // appraised value stay at their defaults until an appraisal comes back.
  const valueBasis = conservativeValueBasis(
    deal.purchasePrice ? Number(deal.purchasePrice) : null,
    deal.estimatedAsIsValue ? Number(deal.estimatedAsIsValue) : null
  );
  const approvedLtv =
    typeof loanAmountValue === "number" && valueBasis ? (loanAmountValue / valueBasis) * 100 : null;

  await db
    .update(deals)
    .set({
      lenderId: termSheet.lenderId,
      productId: termSheet.productId,
      finalRate: typeof rateValue === "number" ? String(rateValue) : null,
      finalTerms: summarizeTerms(termSheet.fields),
      finalAmortizationType: typeof amortizationTypeValue === "string" && amortizationTypeValue ? amortizationTypeValue : null,
      finalLoanTermYears: typeof loanTermYearsValue === "number" ? loanTermYearsValue : null,
      approvedLoanAmount: typeof loanAmountValue === "number" ? String(loanAmountValue) : null,
      approvedLtv: approvedLtv !== null ? String(approvedLtv) : null,
      costToBorrowerFee: typeof costToBorrowerFeeValue === "number" ? String(costToBorrowerFeeValue) : null,
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

  revalidatePath(`/deals/${dealId}`);
}

export async function sendTermSheetsToBorrower(dealId: string, formData: FormData) {
  const user = await requireUser();
  if (!user.email) throw new Error("Your account has no email on file");

  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    with: { assignedLoanOfficer: true },
  });
  if (!deal?.borrowerEmail) throw new Error("This deal has no borrower email on file");

  const termSheetIds = formData
    .getAll("termSheetIds")
    .filter((v): v is string => typeof v === "string");
  if (!termSheetIds.length) return;

  const schedulingLink = deal.assignedLoanOfficer?.schedulingLink;
  if (!schedulingLink) {
    throw new Error("The assigned loan officer doesn't have a scheduling link on file yet");
  }

  const selectedTermSheets = await db.query.termSheets.findMany({
    where: inArray(termSheets.id, termSheetIds),
  });

  const baseUrl = process.env.NEXTAUTH_URL ?? "";
  const links = termSheetIds.map((id) => `${baseUrl}/api/term-sheets/${id}/pdf`);
  const [companyName, dscrCalculatorLink] = await Promise.all([getCompanyName(), getDscrCalculatorLink()]);
  const summary = summarizeTermSheetsForBorrowerEmail(deal, selectedTermSheets);
  const templateKey = resolveTermSheetReadyTemplateKey(deal.loanCategory);

  const { subject, body } = await buildBorrowerEmail(templateKey, deal, {
    assignedLoanOfficerName: deal.assignedLoanOfficer?.name ?? "",
    companyName,
    senderName: user.name ?? "",
    extra: {
      termSheetLinks: links.join("\n"),
      schedulingLink,
      dscrCalculatorLink: dscrCalculatorLink ?? "(add a DSCR calculator link in Company Settings)",
      ...summary,
    },
  });

  await sendGmailAs(user.id, user.email, {
    to: deal.borrowerEmail,
    subject,
    body,
  });

  revalidatePath(`/deals/${dealId}`);
}

export async function sendBookACallEmail(dealId: string) {
  const user = await requireUser();
  if (!user.email) throw new Error("Your account has no email on file");

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
  const { subject, body } = await buildBorrowerEmail("borrower_book_a_call", deal, {
    assignedLoanOfficerName: deal.assignedLoanOfficer?.name ?? "",
    companyName,
    senderName: user.name ?? "",
    extra: { schedulingLink },
  });

  await sendGmailAs(user.id, user.email, {
    to: deal.borrowerEmail,
    subject,
    body,
  });

  revalidatePath(`/deals/${dealId}`);
}
