import { describe, expect, it } from "vitest";
import { loanAmountHoldingLtv, reservesRequiredFor, reservesRuleFor } from "../term-sheet-calculations";

describe("loanAmountHoldingLtv", () => {
  it("moves the loan amount to keep the same LTV against a new value", () => {
    // 70% of $240,000 purchase price; the appraisal comes in at $231,000
    expect(loanAmountHoldingLtv(168_000, 240_000, 231_000)).toBe(161_700);
    // and back again
    expect(loanAmountHoldingLtv(161_700, 231_000, 240_000)).toBe(168_000);
  });
  it("rounds to whole dollars and refuses to guess without both figures", () => {
    expect(loanAmountHoldingLtv(100_000, 300_000, 250_001)).toBe(83_334);
    expect(loanAmountHoldingLtv(168_000, 240_000, null)).toBeNull();
    expect(loanAmountHoldingLtv(168_000, null, 231_000)).toBeNull();
    expect(loanAmountHoldingLtv(0, 240_000, 231_000)).toBeNull();
  });
});

describe("reservesRequiredFor", () => {
  it("DSCR is months of PITIA", () => {
    expect(reservesRuleFor("dscr_purchase")).toBe("pitia");
    expect(reservesRequiredFor("dscr_purchase", { monthlyPayment: 2000, months: 6, lumpSum: null })).toBe(12_000);
  });

  it("bridge is months of the interest payment", () => {
    expect(reservesRuleFor("bridge_purchase")).toBe("payments");
    // $280,000 at 9.99% interest only = $2,331/mo
    const payment = (280_000 * 0.0999) / 12;
    expect(reservesRequiredFor("bridge_purchase", { monthlyPayment: payment, months: 6, lumpSum: null })).toBeCloseTo(13_986, 0);
    expect(reservesRequiredFor("bridge_refinance", { monthlyPayment: 2000, months: 3, lumpSum: 0 })).toBe(6000);
  });

  it("a bridge lump sum replaces the months calculation", () => {
    expect(reservesRequiredFor("bridge_purchase", { monthlyPayment: 2331, months: 6, lumpSum: 28_000 })).toBe(28_000);
  });

  it("fix-and-flip stays the lump sum the lender quotes", () => {
    expect(reservesRuleFor("fix_and_flip")).toBe("lump_sum");
    expect(reservesRequiredFor("fix_and_flip", { monthlyPayment: 2331, months: 6, lumpSum: 15_000 })).toBe(15_000);
    expect(reservesRequiredFor("fix_and_flip", { monthlyPayment: 2331, months: 6, lumpSum: null })).toBeNull();
  });

  it("is null when the payment can't be worked out yet", () => {
    expect(reservesRequiredFor("bridge_purchase", { monthlyPayment: null, months: 6, lumpSum: null })).toBeNull();
  });
});
