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

describe("calculateEstimatedCashToClose with a net proceeds cap", () => {
  const base = {
    loanCategory: "dscr_rate_term_refinance",
    purchasePrice: null,
    mortgagePayoffAmount: 153000,
    closingDisbursement: 168000,
    originationFee: 2856,
    costToBorrowerFee: 1680,
    underwritingDocFee: 2240,
  };

  it("holds net proceeds at the cap when the estimate is over (matches the PDF)", async () => {
    const { calculateEstimatedCashToClose } = await import("@/lib/term-sheet-calculations");
    // paid prior 2,129 − net 5,000
    expect(calculateEstimatedCashToClose({ ...base, netProceedsCap: 5000 })).toBe(2129 - 5000);
    expect(calculateEstimatedCashToClose(base)).toBe(2129 - 8224);
  });

  it("leaves the net alone when it's under the cap, or on other loan types", async () => {
    const { calculateEstimatedCashToClose } = await import("@/lib/term-sheet-calculations");
    expect(calculateEstimatedCashToClose({ ...base, netProceedsCap: 20000 })).toBe(2129 - 8224);
    expect(
      calculateEstimatedCashToClose({ ...base, loanCategory: "dscr_cash_out_refinance", netProceedsCap: 5000 })
    ).toBe(2129 - 8224);
  });
});
