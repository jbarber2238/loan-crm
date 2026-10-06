import { describe, expect, it } from "vitest";
import { calculateRefiNetProceeds, maxLoanAmountForNetProceedsCap } from "@/lib/term-sheet-calculations";

describe("calculateRefiNetProceeds", () => {
  it("matches the term sheet PDF's figure (CV3 example: $8,224)", () => {
    expect(
      calculateRefiNetProceeds({
        loanAmount: 168000,
        mortgagePayoff: 153000,
        originationFee: 2856,
        rateBuydownFee: 1680,
        underwritingDocFee: 2240,
      })
    ).toBe(8224);
  });
});

describe("maxLoanAmountForNetProceedsCap", () => {
  const base = { mortgagePayoff: 153000, originationPoints: 1.7, rateBuydownPoints: 1, underwritingDocFee: 2240 };

  function netAt(loanAmount: number) {
    return calculateRefiNetProceeds({
      loanAmount,
      mortgagePayoff: base.mortgagePayoff,
      originationFee: Math.max(Math.round(loanAmount * (base.originationPoints / 100)), 2500),
      rateBuydownFee: Math.round(loanAmount * (base.rateBuydownPoints / 100)),
      underwritingDocFee: base.underwritingDocFee,
    });
  }

  it("returns the largest loan whose net proceeds are at or under the cap", () => {
    const max = maxLoanAmountForNetProceedsCap({ cap: 5000, ...base })!;
    expect(netAt(max)).toBeLessThanOrEqual(5000);
    expect(netAt(max + 1)).toBeGreaterThan(5000);
  });

  it("respects the $2,500 origination floor on small loans", () => {
    const small = { mortgagePayoff: 50000, originationPoints: 1, rateBuydownPoints: 0, underwritingDocFee: 1000 };
    const max = maxLoanAmountForNetProceedsCap({ cap: 0, ...small })!;
    // fees = 2,500 floor + 1,000 → loan can be payoff + 3,500
    expect(max).toBe(53500);
  });

  it("returns null for unusable inputs", () => {
    expect(maxLoanAmountForNetProceedsCap({ cap: NaN, ...base })).toBeNull();
  });
});
