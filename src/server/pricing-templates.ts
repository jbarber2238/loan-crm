import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { emailTemplates } from "@/server/db/schema";
import {
  CITIZENSHIP_STATUSES,
  EXIT_STRATEGIES,
  LOAN_CATEGORIES,
  PROPERTY_TYPES,
  labelFor,
} from "@/lib/labels";
import type { deals } from "@/server/db/schema";

type Deal = typeof deals.$inferSelect;

const REFINANCE_CATEGORIES = new Set(["dscr_cash_out_refinance", "dscr_rate_term_refinance", "bridge_refinance"]);
const PURCHASE_CATEGORIES = new Set(["dscr_purchase", "bridge_purchase"]);

function money(value: string | null): string {
  return value ? `$${Number(value).toLocaleString()}` : "Not provided";
}

// HOA is frequently genuinely inapplicable rather than missing data.
function moneyOrNA(value: string | null): string {
  return value ? `$${Number(value).toLocaleString()}` : "N/A";
}

function ltv(loanAmount: string, basis: string | null): string {
  if (!basis || Number(basis) === 0) return `${money(loanAmount)} ; Not provided`;
  const pct = (Number(loanAmount) / Number(basis)) * 100;
  return `${money(loanAmount)} ; ${pct.toFixed(1)}%`;
}

function experience(deal: Deal): string {
  const { numFlips, numRentals, numNewConstruction } = deal;
  if (numFlips === null && numRentals === null && numNewConstruction === null) return "Not provided";
  return `${numFlips ?? 0} flips, ${numRentals ?? 0} rentals, ${numNewConstruction ?? 0} new construction (36mo)`;
}

// A missing purchase date usually means the borrower already owns the
// property (nothing to report), not that data is missing — "N/A" reads
// better to a lender rep than "Not provided" in that case.
function dateOrNA(date: Date | null, format: "full" | "MM/YY" = "full"): string {
  if (!date) return "N/A";
  if (format === "MM/YY") {
    return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getFullYear()).slice(2)}`;
  }
  return date.toLocaleDateString("en-US");
}

function yesNo(value: boolean | null): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "Not provided";
}

function dscrOrBridge(category: string): string {
  return category.startsWith("dscr") ? "DSCR" : "Bridge";
}

// The stable key of the pricing_request template that applies to a given
// loan category — Portfolio has no dedicated template yet, so it falls back
// to the purchase one (closest fit).
export function resolvePricingTemplateKey(loanCategory: string): string {
  if (REFINANCE_CATEGORIES.has(loanCategory)) return "pricing_refinance";
  if (PURCHASE_CATEGORIES.has(loanCategory)) return "pricing_purchase";
  if (loanCategory === "fix_and_flip") return "pricing_fix_and_flip";
  if (loanCategory === "new_construction") return "pricing_new_construction";
  return "pricing_purchase";
}

/** Every merge field a pricing_request template body/subject can reference. */
export function buildPricingTemplateTokens(
  deal: Deal,
  { repName, senderName, companyName, notes }: { repName: string; senderName: string; companyName: string; notes: string | null }
): Record<string, string> {
  const purchasePriceOrAsIs = deal.purchasePrice ?? deal.estimatedAsIsValue;

  return {
    repName,
    senderName,
    companyName,
    notesLine: notes ? `\n\nNotes: ${notes}` : "",
    dscrOrBridge: dscrOrBridge(deal.loanCategory),
    entityName: deal.borrowerEntityName ?? "Not provided",
    fico: deal.estimatedFico?.toString() ?? "Not provided",
    citizenship: deal.citizenship ? labelFor(CITIZENSHIP_STATUSES, deal.citizenship) : "Not provided",
    experience: experience(deal),
    propertyAddress: deal.propertyAddress,
    propertyType: deal.propertyType ? labelFor(PROPERTY_TYPES, deal.propertyType) : "Not provided",
    loanPurposeLabel: labelFor(LOAN_CATEGORIES, deal.loanCategory),
    asIsValue: money(deal.estimatedAsIsValue),
    currentBalanceOwed: money(deal.mortgagePayoffAmount),
    ltvOnAsIsValue: ltv(deal.loanAmountRequested, deal.estimatedAsIsValue),
    monthlyRent: money(deal.currentRent),
    annualTaxes: money(deal.annualTaxes),
    annualInsurance: money(deal.annualInsurance),
    annualHoa: moneyOrNA(deal.annualHoa),
    purchaseDate: dateOrNA(deal.propertyPurchaseDate),
    purchaseDateShort: dateOrNA(deal.propertyPurchaseDate, "MM/YY"),
    rehabDone: deal.rehabDescription ?? "Not provided",
    purchasePriceOrAsIs: money(purchasePriceOrAsIs),
    ltvOnPurchaseOrAsIs: ltv(deal.loanAmountRequested, purchasePriceOrAsIs),
    unitCount: deal.unitCount?.toString() ?? "Not provided",
    exitStrategyLabel: deal.exitStrategy ? labelFor(EXIT_STRATEGIES, deal.exitStrategy) : "Not provided",
    purchaseOrRefinanceFlip: deal.propertyAlreadyOwned ? "Refinance (delayed purchase)" : "Purchase",
    purchaseOrRefinanceConstruction: deal.propertyAlreadyOwned ? "Refinance (already own land)" : "Purchase",
    purchasePrice: money(deal.purchasePrice),
    ownsLand: yesNo(deal.propertyAlreadyOwned),
    arv: money(deal.estimatedArv),
    rehabBudget: money(deal.estimatedRehabCost),
    liquidity: money(deal.borrowerLiquidity),
  };
}

export function renderTemplate(text: string, tokens: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => tokens[key] ?? match);
}

/** Renders the pricing_request template for this deal's category into a ready-to-send subject/body. */
export async function buildPricingEmail(
  deal: Deal,
  {
    repName,
    senderName,
    companyName,
    notes,
  }: { repName: string; senderName: string; companyName: string; notes: string | null }
): Promise<{ subject: string; body: string }> {
  const key = resolvePricingTemplateKey(deal.loanCategory);
  const template = await db.query.emailTemplates.findFirst({
    where: eq(emailTemplates.key, key),
  });

  if (!template || !template.active) {
    throw new Error(
      `Pricing email template "${key}" is missing or inactive — check Email Templates in the sidebar.`
    );
  }

  const tokens = buildPricingTemplateTokens(deal, { repName, senderName, companyName, notes });
  return {
    subject: renderTemplate(template.subject, tokens),
    body: renderTemplate(template.body, tokens),
  };
}
