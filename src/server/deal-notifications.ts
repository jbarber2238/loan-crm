import { asc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals, users } from "@/server/db/schema";
import { sendGmailAs } from "@/server/gmail/send";
import { getCompanyName, getCompanyLogoHtml } from "@/server/settings";
import { getUserEmailSignatureHtml } from "@/server/users";
import { emailShell, htmlButton, htmlFactList, escapeHtml } from "@/lib/email-html";
import { labelFor, LOAN_CATEGORIES } from "@/lib/labels";
import {
  ratioMetricsFor,
  estimatedMonthlyPI,
  estimatedMonthlyPitia,
  calculateDscrRatio,
} from "@/lib/term-sheet-calculations";

const DSCR_CATEGORIES = new Set(["dscr_purchase", "dscr_cash_out_refinance", "dscr_rate_term_refinance"]);

// A DSCR loan's real rate isn't known until it's priced — this is the same
// 7.5%/30-year placeholder the deal page's own DSCR Calculator scratchpad
// defaults to, used here purely as a rough day-one sanity check ("does this
// look wildly off"), never as an actual quote.
const ROUGH_DSCR_RATE_PCT = 7.5;
const ROUGH_DSCR_TERM_YEARS = 30;

function money(value: string | number | null): string {
  if (value === null) return "Not provided";
  return `$${Number(value).toLocaleString()}`;
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

/**
 * Shared by every borrower-facing deal notification below — sent from the
 * deal's own assigned loan officer's real Gmail (same "no shared platform
 * sender" convention every other borrower email in this app follows), never
 * a generic system address. Best-effort: an LO who hasn't signed in yet (no
 * Gmail token on file) or a deal with no borrower email on file just means
 * the notification is silently skipped, not a hard failure — callers wrap
 * this in a catch anyway, but a missing prerequisite here isn't an error to
 * begin with.
 */
async function sendBorrowerNotification(dealId: string, subject: string, bodyHtml: string): Promise<void> {
  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    with: { assignedLoanOfficer: true },
  });
  if (!deal?.borrowerEmail) return;
  const loanOfficer = deal.assignedLoanOfficer;
  if (!loanOfficer?.email) return;

  const [companyName, logoHtml, signatureHtml] = await Promise.all([
    getCompanyName(),
    getCompanyLogoHtml(),
    getUserEmailSignatureHtml(loanOfficer.id),
  ]);

  const body = emailShell({ companyName, heading: subject, bodyHtml });

  await sendGmailAs(loanOfficer.id, loanOfficer.email, {
    to: deal.borrowerEmail,
    subject,
    body: logoHtml + body + signatureHtml,
    html: true,
  });
}

/** Fires once, right when a deal is created — intake form or staff "New Deal" alike. */
export async function notifyBorrowerOfSubmission(dealId: string): Promise<void> {
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) return;

  await sendBorrowerNotification(
    dealId,
    `We've received your loan inquiry — ${deal.propertyAddress}`,
    `<p>Hi ${firstName(deal.borrowerName)},</p>
     <p>Thanks for reaching out — we've received your loan inquiry for ${deal.propertyAddress}. Our team is reviewing and will price out terms shortly.</p>`
  );
}

/** Fires when advanceDealStage moves a deal from New to Rate Shopping (see createPricingRequests). */
export async function notifyBorrowerOfRateShopping(dealId: string): Promise<void> {
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) return;

  await sendBorrowerNotification(
    dealId,
    `We're pricing out terms for you — ${deal.propertyAddress}`,
    `<p>Hi ${firstName(deal.borrowerName)},</p>
     <p>The team has reviewed your deal and is pricing out terms for you. We'll follow up as soon as we have options to share.</p>`
  );
}

/**
 * Fires when advanceDealStage moves a deal from Negotiation to Application —
 * the processing-fee invoice getting marked paid (see the Stripe webhook).
 * Reads the term-sheet-acceptance figures already on the deal
 * (finalRate/approvedLtv/approvedLoanAmount, set by performTermSheetAcceptance
 * / updateAcceptedTerms) rather than recomputing anything.
 */
export async function notifyBorrowerOfAcceptedTerms(dealId: string): Promise<void> {
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) return;

  const terms = [
    deal.finalRate ? { label: "Interest rate", value: `${Number(deal.finalRate)}%` } : null,
    deal.approvedLtv ? { label: "Loan-to-value", value: `${Number(deal.approvedLtv).toFixed(1)}%` } : null,
    deal.approvedLoanAmount ? { label: "Loan amount", value: money(deal.approvedLoanAmount) } : null,
  ].filter((t): t is { label: string; value: string } => t !== null);

  await sendBorrowerNotification(
    dealId,
    `Congratulations — your terms are set for ${deal.propertyAddress}`,
    `<p>Hi ${firstName(deal.borrowerName)},</p>
     <p>Congratulations on accepting the following terms:</p>
     ${htmlFactList(terms)}
     <p>The loan processor assigned to your file will be reaching out shortly to introduce themselves and begin collecting the documents needed for your application to the lender.</p>`
  );
}

/**
 * Fires only when the processing-fee invoice is paid and the deal
 * auto-advances into Application (see the Stripe webhook) — deliberately
 * NOT when a processor is merely assigned in Roles, so a pre-assigned
 * processor hears nothing until there's real work to start. Sent from the
 * deal's loan officer's own Gmail, like every other deal notification.
 */
export async function notifyProcessorOfPaidDeal(dealId: string): Promise<void> {
  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    with: { assignedLoanOfficer: true, assignedProcessor: true, lender: true },
  });
  if (!deal?.assignedProcessor?.email) return; // no processor assigned yet — nothing to send
  const sender = deal.assignedLoanOfficer;
  if (!sender?.email) return;

  const term =
    deal.finalLoanTermMonths != null
      ? `${deal.finalLoanTermMonths} months`
      : deal.finalLoanTermYears != null
        ? `${deal.finalLoanTermYears} years`
        : deal.finalTerms;
  const points = deal.originationPointsOverride != null ? Number(deal.originationPointsOverride) : 2;

  const facts = [
    { label: "Borrower", value: deal.borrowerName },
    { label: "Property", value: deal.propertyAddress },
    { label: "Loan type", value: labelFor(LOAN_CATEGORIES, deal.loanCategory) },
    deal.lender ? { label: "Lender", value: deal.lender.name } : null,
    deal.approvedLoanAmount ? { label: "Loan amount", value: money(deal.approvedLoanAmount) } : null,
    deal.finalRate ? { label: "Interest rate", value: `${Number(deal.finalRate)}%` } : null,
    term ? { label: "Loan term", value: term } : null,
    deal.finalAmortizationType ? { label: "Amortization", value: deal.finalAmortizationType } : null,
    { label: "Origination points", value: `${points}%` },
    { label: "Loan officer", value: sender.name ?? sender.email },
  ].filter((f): f is { label: string; value: string } => f !== null);

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const [companyName, logoHtml, signatureHtml] = await Promise.all([
    getCompanyName(),
    getCompanyLogoHtml(),
    getUserEmailSignatureHtml(sender.id),
  ]);

  const body = emailShell({
    companyName,
    heading: "New deal ready to process",
    bodyHtml: `
      <p>Hi ${escapeHtml(firstName(deal.assignedProcessor.name ?? "there"))},</p>
      <p>The borrower has paid the processing fee and this deal has moved into Application — it's ready for you to start processing.</p>
      ${htmlFactList(facts)}
      <p>${htmlButton("View Deal", `${appUrl}/deals/${deal.id}`)}</p>
    `,
  });

  await sendGmailAs(sender.id, sender.email, {
    to: deal.assignedProcessor.email,
    subject: `Ready to process — ${deal.borrowerName} (${deal.propertyAddress})`,
    body: logoHtml + body + signatureHtml,
    html: true,
  });
}

/**
 * Fires once, right when a deal is created — from the public intake form or
 * a staffer's own "New Deal" form alike. Sent to whichever admin account is
 * oldest (the account owner, "the primary admin") from their own connected
 * Gmail, same as every other email this app sends.
 */
export async function notifyAdminOfNewDeal(dealId: string): Promise<void> {
  const admin = await db.query.users.findFirst({
    where: eq(users.isAdmin, true),
    orderBy: asc(users.createdAt),
  });
  if (!admin?.email) return;

  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    with: { assignedLoanOfficer: true },
  });
  if (!deal) return;

  const loanAmount = Number(deal.loanAmountRequested);
  const purchasePrice = deal.purchasePrice ? Number(deal.purchasePrice) : null;
  const estimatedAsIsValue = deal.estimatedAsIsValue ? Number(deal.estimatedAsIsValue) : null;
  const ratios = ratioMetricsFor(deal.loanCategory, {
    loanAmount,
    purchasePrice,
    estimatedAsIsValue,
    approvedArv: deal.estimatedArv ? Number(deal.estimatedArv) : null,
    approvedRehabCost: deal.estimatedRehabCost ? Number(deal.estimatedRehabCost) : null,
  });

  const facts = [
    { label: "Borrower", value: deal.borrowerName },
    { label: "Property", value: deal.propertyAddress },
    { label: "Loan type", value: labelFor(LOAN_CATEGORIES, deal.loanCategory) },
    { label: "Requested loan amount", value: money(loanAmount) },
    ...ratios
      .filter((r) => r.valuePct !== null)
      .map((r) => ({ label: r.label, value: `${r.valuePct!.toFixed(1)}%` })),
  ];

  if (DSCR_CATEGORIES.has(deal.loanCategory) && deal.currentRent) {
    const monthlyRent = Number(deal.currentRent);
    const pAndI = estimatedMonthlyPI(loanAmount, ROUGH_DSCR_RATE_PCT, ROUGH_DSCR_TERM_YEARS);
    const pitia = estimatedMonthlyPitia(
      pAndI,
      deal.annualTaxes ? Number(deal.annualTaxes) : null,
      deal.annualInsurance ? Number(deal.annualInsurance) : null,
      deal.annualHoa ? Number(deal.annualHoa) : null
    );
    const dscr = calculateDscrRatio(monthlyRent, pitia);
    if (dscr !== null) {
      facts.push({ label: `Est. DSCR (at ${ROUGH_DSCR_RATE_PCT}%, ${ROUGH_DSCR_TERM_YEARS}-yr)`, value: dscr.toFixed(2) });
    }
  }

  if (deal.assignedLoanOfficer) {
    facts.push({ label: "Assigned to", value: deal.assignedLoanOfficer.name ?? deal.assignedLoanOfficer.email ?? "" });
  }
  if (deal.source) {
    facts.push({ label: "Source", value: deal.source });
  }

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const [companyName, logoHtml, signatureHtml] = await Promise.all([
    getCompanyName(),
    getCompanyLogoHtml(),
    getUserEmailSignatureHtml(admin.id),
  ]);

  const body = emailShell({
    companyName,
    heading: "New Deal Submitted",
    bodyHtml: `
      <p>A new deal just came in.</p>
      ${htmlFactList(facts)}
      <p>${htmlButton("View Deal", `${appUrl}/deals/${deal.id}`)}</p>
    `,
  });

  await sendGmailAs(admin.id, admin.email, {
    to: admin.email,
    subject: `New deal submitted — ${deal.borrowerName} (${deal.propertyAddress})`,
    body: logoHtml + body + signatureHtml,
    html: true,
  });
}
