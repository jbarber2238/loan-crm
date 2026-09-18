import { CITIZENSHIP_STATUSES, EXIT_STRATEGIES, LOAN_CATEGORIES, PROPERTY_TYPES, labelFor } from "@/lib/labels";
import { ratioMetricsFor, valueBasisFor } from "@/lib/term-sheet-calculations";
import type { deals } from "@/server/db/schema";

type Deal = typeof deals.$inferSelect;

function yesNo(value: boolean | null): string {
  if (value === null) return "not provided";
  return value ? "Yes" : "No";
}

// A blank/placeholder value here ("TBD", "N/A", etc.) means the same thing
// as no value at all — a loan officer sometimes types one of these into a
// field rather than leaving it empty.
const PLACEHOLDER_VALUES = new Set(["tbd", "n/a", "na", "none", "pending", "unknown", "-"]);

function entityNameOrNotProvided(value: string | null): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed || PLACEHOLDER_VALUES.has(trimmed.toLowerCase())) return "not provided";
  return trimmed;
}

/**
 * The common "here's everything about this deal" block fed to every
 * deal-level AI feature. Includes pre-computed LTV/LTC/LTARV rather than
 * leaving the model to work them out from the raw dollar figures — asking
 * an LLM to do that arithmetic itself is exactly the kind of thing it gets
 * subtly wrong (or inconsistent run-to-run): e.g. computing "loan-to-cost"
 * against purchase price alone instead of purchase price + rehab/
 * construction budget, which on a ground-up construction deal massively
 * overstates the ratio and wrongly disqualifies an otherwise-fitting
 * lender. This app already has the correct formulas (the same ones the
 * accepted-terms header and term sheet PDF use) — hand over the answer,
 * not the ingredients.
 */
export function buildDealSummaryForAi(deal: Deal): string {
  const loanAmount = Number(deal.loanAmountRequested) || 0;
  const purchasePrice = deal.purchasePrice ? Number(deal.purchasePrice) : null;
  const estimatedAsIsValue = deal.estimatedAsIsValue ? Number(deal.estimatedAsIsValue) : null;
  const estimatedArv = deal.estimatedArv ? Number(deal.estimatedArv) : null;
  const estimatedRehabCost = deal.estimatedRehabCost ? Number(deal.estimatedRehabCost) : null;
  const valueBasis = valueBasisFor(deal.loanCategory, purchasePrice, estimatedAsIsValue);
  const totalProjectCost = valueBasis !== null ? valueBasis + (estimatedRehabCost ?? 0) : null;

  const ratios = ratioMetricsFor(deal.loanCategory, {
    loanAmount,
    purchasePrice,
    estimatedAsIsValue,
    approvedArv: estimatedArv,
    approvedRehabCost: estimatedRehabCost,
  });
  const ratioLines = ratios
    .filter((r) => r.valuePct !== null)
    .map((r) => `- ${r.label} (already calculated correctly — use this, don't recompute it yourself): ${r.valuePct!.toFixed(1)}%`);

  return `Deal:
- Borrower: ${deal.borrowerName}
- Borrower entity (the entity the loan will close in, if any): ${entityNameOrNotProvided(deal.borrowerEntityName)}
- Property address: ${deal.propertyAddress}
- Loan category: ${labelFor(LOAN_CATEGORIES, deal.loanCategory)}
- Loan amount requested: $${deal.loanAmountRequested}
- Purchase price: ${purchasePrice ? `$${purchasePrice}` : "not provided"}
- Estimated as-is value: ${estimatedAsIsValue ? `$${estimatedAsIsValue}` : "not provided"}
- Estimated rehab/construction budget: ${estimatedRehabCost ? `$${estimatedRehabCost}` : "not provided"}
- Total project cost (purchase/as-is + rehab/construction budget): ${totalProjectCost !== null ? `$${totalProjectCost.toLocaleString()}` : "not provided"}
- Estimated ARV: ${estimatedArv ? `$${estimatedArv}` : "not provided"}
${ratioLines.join("\n")}
- Estimated FICO: ${deal.estimatedFico ?? "not provided"}
- Property type: ${deal.propertyType ? labelFor(PROPERTY_TYPES, deal.propertyType) : "not provided"}
- Rural property: ${yesNo(deal.rural)}
- Unit count: ${deal.unitCount ?? "not provided"}
- Exit strategy: ${deal.exitStrategy ? labelFor(EXIT_STRATEGIES, deal.exitStrategy) : "not provided"}
- Borrower experience: ${deal.numFlips ?? 0} flips, ${deal.numRentals ?? 0} rentals, ${deal.numNewConstruction ?? 0} new construction (completed, last 36mo)
- Current rent: ${deal.currentRent ? `$${deal.currentRent}` : "not provided"}
- Annual taxes/insurance/HOA: ${deal.annualTaxes ? `$${deal.annualTaxes}` : "?"} / ${deal.annualInsurance ? `$${deal.annualInsurance}` : "?"} / ${deal.annualHoa ? `$${deal.annualHoa}` : "?"}
- Citizenship: ${deal.citizenship ? labelFor(CITIZENSHIP_STATUSES, deal.citizenship) : "not provided"}
- Mortgage late in last 12mo: ${yesNo(deal.mortgageLatesLast12mo)}
- Tax lien / BK / foreclosure in last 24mo: ${yesNo(deal.taxLiensBkForeclosureLast24mo)}
- Borrower liquidity: ${deal.borrowerLiquidity ? `$${deal.borrowerLiquidity}` : "not provided"}
- Source: ${deal.source ?? "not provided"}`;
}
