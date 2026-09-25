// Deal-specific client needs — unlike the three catalog layers (every loan /
// loan category / lender product), these depend on what's actually true of
// this deal, so they're checked against the deal's own fields. A catalog
// item opts in by carrying one of these rule names in clientNeeds.autoRule.
export type AutoRule = "tenant_occupied_dscr" | "refi_with_payoff";

const DSCR_CATEGORIES = new Set(["dscr_purchase", "dscr_cash_out_refinance", "dscr_rate_term_refinance"]);
const REFI_CATEGORIES = new Set(["dscr_cash_out_refinance", "dscr_rate_term_refinance", "bridge_refinance"]);

export function activeRulesFor(deal: {
  loanCategory: string;
  currentOccupancy: string | null;
  mortgagePayoffAmount: string | null;
}): AutoRule[] {
  const rules: AutoRule[] = [];
  if (DSCR_CATEGORIES.has(deal.loanCategory) && deal.currentOccupancy === "tenant_occupied") {
    rules.push("tenant_occupied_dscr");
  }
  const payoff = deal.mortgagePayoffAmount === null ? NaN : Number(deal.mortgagePayoffAmount);
  if (REFI_CATEGORIES.has(deal.loanCategory) && Number.isFinite(payoff) && payoff > 0) {
    rules.push("refi_with_payoff");
  }
  return rules;
}
