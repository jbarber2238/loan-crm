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
  const rehab = new Set(["fix_and_flip", "bridge_purchase", "bridge_refinance", "new_construction"]);
  // For new construction, "as-is value" already means the raw land's
  // value — a separate lot-value field would just be asking the same
  // question twice. Bridge deals keep it since there's an existing
  // structure whose as-is value can genuinely differ from the land alone.
  const lotValue = new Set(["bridge_purchase", "bridge_refinance"]);
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
    // Fix-and-flip and new construction are sized against ARV/total project
    // cost (LTARV/LTC), not a straight purchase-price LTV. Bridge deals keep
    // plain LTV even though they share the same rehab-cost/ARV fields.
    showProjectEconomics: category === "fix_and_flip" || category === "new_construction",
  };
}

export type LoanSections = ReturnType<typeof sectionsFor>;
