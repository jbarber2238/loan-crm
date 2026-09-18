import { asc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals, users } from "@/server/db/schema";
import { sendGmailAs } from "@/server/gmail/send";
import { getCompanyName, getCompanyLogoHtml } from "@/server/settings";
import { getUserEmailSignatureHtml } from "@/server/users";
import { emailShell, htmlButton, htmlFactList } from "@/lib/email-html";
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
