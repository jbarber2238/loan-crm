import { CITIZENSHIP_STATUSES, EXIT_STRATEGIES, LOAN_CATEGORIES, PROPERTY_TYPES, labelFor } from "@/lib/labels";
import type { deals } from "@/server/db/schema";

type Deal = typeof deals.$inferSelect;

function yesNo(value: boolean | null): string {
  if (value === null) return "not provided";
  return value ? "Yes" : "No";
}

/** The common "here's everything about this deal" block fed to every deal-level AI feature. */
export function buildDealSummaryForAi(deal: Deal): string {
  return `Deal:
- Borrower: ${deal.borrowerName}
- Property address: ${deal.propertyAddress}
- Loan category: ${labelFor(LOAN_CATEGORIES, deal.loanCategory)}
- Loan amount requested: $${deal.loanAmountRequested}
- Purchase price: ${deal.purchasePrice ? `$${deal.purchasePrice}` : "not provided"}
- Estimated as-is value: ${deal.estimatedAsIsValue ? `$${deal.estimatedAsIsValue}` : "not provided"}
- Estimated ARV: ${deal.estimatedArv ? `$${deal.estimatedArv}` : "not provided"}
- Estimated FICO: ${deal.estimatedFico ?? "not provided"}
- Property type: ${deal.propertyType ? labelFor(PROPERTY_TYPES, deal.propertyType) : "not provided"}
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
