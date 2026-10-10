import { describe, expect, it } from "vitest";
import { calculateEstimatedCashToClose, isOwnedPropertyDrawLoan, landCostBasis } from "@/lib/term-sheet-calculations";

describe("isOwnedPropertyDrawLoan", () => {
  it("only applies to draw loans on property the borrower already owns", () => {
    expect(isOwnedPropertyDrawLoan("new_construction", true)).toBe(true);
    expect(isOwnedPropertyDrawLoan("fix_and_flip", true)).toBe(true);
    expect(isOwnedPropertyDrawLoan("new_construction", false)).toBe(false);
    expect(isOwnedPropertyDrawLoan("dscr_purchase", true)).toBe(false);
  });
});

describe("landCostBasis", () => {
  const base = { loanCategory: "new_construction", purchasePrice: 30000, estimatedAsIsValue: 35000 };

  it("uses the stated current value when the borrower already owns the land", () => {
    expect(landCostBasis({ ...base, propertyAlreadyOwned: true })).toEqual({ value: 35000, usesStatedValue: true });
  });

  it("uses the purchase price when they're buying it", () => {
    expect(landCostBasis({ ...base, propertyAlreadyOwned: false })).toEqual({ value: 30000, usesStatedValue: false });
  });

  it("falls back to the purchase price when no current value was given", () => {
    expect(landCostBasis({ ...base, propertyAlreadyOwned: true, estimatedAsIsValue: null }).value).toBe(30000);
  });
});

describe("cash to close on an owned-land construction loan", () => {
  const inputs = {
    loanCategory: "new_construction",
    purchasePrice: 30000,
    mortgagePayoffAmount: null,
    closingDisbursement: 10250, // the initial advance
    originationFee: 7425,
    costToBorrowerFee: 3712.5,
    underwritingDocFee: 1595,
  };

  it("has no down payment: fees less the initial advance, plus what was paid up front", () => {
    // $12,732.50 fees - $10,250 advance = $2,482.50 due, plus $2,129 paid prior
    expect(calculateEstimatedCashToClose({ ...inputs, propertyAlreadyOwned: true })).toBeCloseTo(4611.5, 2);
  });

  it("still charges the down payment when the property is being bought", () => {
    // $19,750 down + $12,732.50 fees + $2,129 paid prior
    expect(calculateEstimatedCashToClose({ ...inputs, propertyAlreadyOwned: false })).toBeCloseTo(34611.5, 2);
  });
});
