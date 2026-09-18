// Which fields/sections are relevant for each loan category. Shared by the
// intake form (what borrowers are asked) and the staff Overview tab (what's
// shown/edited) so the two never drift apart.
export function sectionsFor(category: string) {
  const purchase = new Set([
    "dscr_purchase",
    "dscr_cash_out_refinance",
    "dscr_rate_term_refinance",
    "fix_and_flip",
    "bridge_purchase",
    "bridge_refinance",
    "new_construction",
  ]);
  const refinance = new Set(["dscr_cash_out_refinance", "dscr_rate_term_refinance", "bridge_refinance"]);
  // Bridge is sized against the property's value today (plain LTV, same as
  // DSCR — see ratioMetricsFor in term-sheet-calculations.ts), not against a
  // rehab budget or ARV, so it has no business asking for either. This
  // matters, not just cosmetic: nothing downstream (deal calculations, term
  // sheets) ever uses a bridge deal's rehab/ARV/lot-value fields anyway.
  const rehab = new Set(["fix_and_flip", "new_construction"]);
  // For new construction, "as-is value" already means the raw land's
  // value — a separate lot-value field would just be asking the same
  // question twice. No other category needs a distinct lot value from its
  // as-is value.
  const lotValue = new Set<string>();
  // New construction has no existing rent, taxes, insurance, HOA, rental
  // strategy, or occupancy to speak of — there's nothing standing yet.
  const rental = new Set([
    "dscr_purchase",
    "dscr_cash_out_refinance",
    "dscr_rate_term_refinance",
    "bridge_purchase",
    "bridge_refinance",
  ]);

  return {
    isPortfolio: category === "portfolio",
    showPurchasePrice: purchase.has(category),
    showRefinanceFields: refinance.has(category),
    showRehabFields: rehab.has(category),
    showLotValue: lotValue.has(category),
    showRental: rental.has(category),
    showFixFlipOwnership: category === "fix_and_flip",
    showConstructionLandOwnership: category === "new_construction",
    // Unlike Fix & Flip/New Construction (where rehab is a given), a DSCR
    // Cash-Out Refinance may or may not have had rehab done since purchase
    // — asked explicitly, gating the shared estimatedRehabCost/
    // rehabDescription fields rather than always requiring them.
    showCashOutRefiRehabQuestion: category === "dscr_cash_out_refinance",
    // Fix-and-flip and new construction are sized against ARV/total project
    // cost (LTARV/LTC), not a straight purchase-price LTV. Bridge deals keep
    // plain LTV even though they share the same rehab-cost/ARV fields.
    showProjectEconomics: category === "fix_and_flip" || category === "new_construction",
  };
}

export type LoanSections = ReturnType<typeof sectionsFor>;

// Fix-and-flip and new construction share one intake field for the
// rehab/construction budget. New construction calls it "Construction"
// everywhere downstream; every other category (fix-and-flip, bridge) calls
// it "Rehab" — same underlying field either way.
export function rehabOrConstructionLabel(category: string): "Rehab" | "Construction" {
  return category === "new_construction" ? "Construction" : "Rehab";
}

// Same field, term-sheet-and-later stage: once a number is on the term
// sheet it's the working budget (refined via the lender's own budget sheet
// through closing), not just the borrower's intake-time estimate.
export function rehabOrConstructionBudgetLabel(category: string): "Rehab Budget" | "Construction Budget" {
  return category === "new_construction" ? "Construction Budget" : "Rehab Budget";
}

// Fix-and-flip, new construction, and bridge are all short-term,
// interest-only loans in practice — their term is naturally quoted and
// displayed in months (e.g. "12 Months"), not years like a DSCR/Portfolio
// long-term amortizing loan.
const INTEREST_ONLY_CATEGORIES = new Set(["fix_and_flip", "new_construction", "bridge_purchase", "bridge_refinance"]);
export function isInterestOnlyCategory(category: string): boolean {
  return INTEREST_ONLY_CATEGORIES.has(category);
}
