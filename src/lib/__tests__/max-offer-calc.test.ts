import { describe, it, expect } from "vitest";
import { calculate, scenario, offerVsMax, stressTest, status, DEFAULTS } from "@/lib/max-offer-calc";

// Test vectors ported verbatim from the design handoff's calc.test.js — they
// match the approved mockups and the current Excel export, so they pin this
// module to the agreed-upon math.
function near(a: number, b: number, tol = 1) {
  expect(Math.abs(a - b)).toBeLessThanOrEqual(tol);
}

describe("max-offer-calc", () => {
  it("matches the default deal: $400k ARV, $60k rehab, 70% rule, 6 months, 10.5%, 90% LTC, 2 pts", () => {
    const r = calculate(DEFAULTS);
    near(r.mao, 220000);
    near(r.loan, 252000);
    near(r.interest, 13230);
    near(r.holding, 3450);
    near(r.acquisition, 4400);
    near(r.points, 5040);
    near(r.selling, 28000);
    near(r.totalCost, 306120);
    near(r.profit, 65880);
    near(r.cashIn, 54120);
    near(r.margin, 0.165, 0.0005);
    near(r.cashOnCash, 1.217, 0.0005);
    expect(status(r.margin)).toBe("on_target");
    expect(r.limitedBy).toBe("Loan-to-cost");
  });

  it("stress-tests at the max offer", () => {
    const r = calculate(DEFAULTS);
    const st = stressTest(DEFAULTS, r.mao);
    near(st[0].profit, 65880);
    near(st[1].profit, 47280);
    near(st[2].profit, 28680);
    near(st[3].profit, 10080);
    near(st[1].margin, 0.124, 0.0005);
    near(st[2].margin, 0.080, 0.0005);
    near(st[3].margin, 0.030, 0.0005);
  });

  it("computes profit for offers under and over the max", () => {
    near(scenario(DEFAULTS, 200000).profit, 87585);
    near(scenario(DEFAULTS, 235000).profit, 49601);
    near(scenario(DEFAULTS, 250000).profit, 33322);
  });

  it("flags an over-max offer, its profit change, and its break-even point", () => {
    const over = offerVsMax(DEFAULTS, 235000);
    expect(over.state).toBe("over");
    near(over.profitChange, -16279);
    near(over.breakEvenOffer, 281176, 2);
  });

  it("flags an under-max offer", () => {
    expect(offerVsMax(DEFAULTS, 200000).state).toBe("under");
  });
});
