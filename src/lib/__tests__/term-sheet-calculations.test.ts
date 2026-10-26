import { describe, expect, it } from "vitest";
import { loanAmountHoldingLtv } from "../term-sheet-calculations";

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
