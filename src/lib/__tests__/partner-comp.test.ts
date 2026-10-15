import { describe, expect, it } from "vitest";
import {
  evaluateTier,
  estimatePayout,
  formatPayoutEstimate,
  identityFor,
  partnerPayoutAmount,
  partnerStageFor,
  payoutRate,
  referralSlugFrom,
  sameBorrower,
  withinTrailingWindow,
} from "@/lib/partner-comp";

describe("payout math", () => {
  it("20% of the minimum $2,500 fee is $500, and 10% is $250", () => {
    expect(partnerPayoutAmount(2500, 20)).toBe(500);
    expect(partnerPayoutAmount(2500, 10)).toBe(250);
    expect(partnerPayoutAmount(2500, 25)).toBe(625);
  });

  it("uses 20/25% on a first deal and 10% on trailing deals", () => {
    expect(payoutRate("first", 20)).toBe(20);
    expect(payoutRate("first", 25)).toBe(25);
    expect(payoutRate("trailing", 25)).toBe(10);
  });
});

describe("estimatePayout", () => {
  const base = { ratePercent: 20, loanAmountRequested: 300_000, approvedLoanAmount: null, originationPointsOverride: null, brokerFeeCollected: null };

  it("is a range until a term sheet is signed (1.5-2.5 points, $2,500 minimum fee)", () => {
    // 1.5% of $300k = $4,500 -> $900; 2.5% = $7,500 -> $1,500
    expect(estimatePayout(base)).toEqual({ kind: "range", low: 900, high: 1500 });
  });

  it("applies the $2,500 minimum fee to small loans", () => {
    expect(estimatePayout({ ...base, loanAmountRequested: 100_000 })).toEqual({ kind: "range", low: 500, high: 500 });
  });

  it("is exact from the approved loan and points, final from the fee collected", () => {
    expect(estimatePayout({ ...base, approvedLoanAmount: 400_000, originationPointsOverride: 1.7 })).toEqual({ kind: "exact", amount: 1360 });
    expect(estimatePayout({ ...base, approvedLoanAmount: 400_000, brokerFeeCollected: 6800 })).toEqual({ kind: "final", amount: 1360 });
  });

  it("labels estimates and leaves finals plain", () => {
    expect(formatPayoutEstimate({ kind: "range", low: 900, high: 1500 })).toBe("$900–$1,500 (estimated range)");
    expect(formatPayoutEstimate({ kind: "final", amount: 1360 })).toBe("$1,360");
  });
});

describe("repeat-borrower matching", () => {
  const original = identityFor({ name: "Pat Smith", email: "pat@x.com", entity: "Smith Holdings LLC" });

  it("matches when two of name, email, entity agree", () => {
    expect(sameBorrower(original, identityFor({ name: "pat smith", email: "pat@x.com", entity: "Other LLC" }))).toBe(true);
    expect(sameBorrower(original, identityFor({ name: "Someone", email: "pat@x.com", entity: "Smith Holdings Inc" }))).toBe(true);
    expect(sameBorrower(original, identityFor({ name: "Pat Smith", email: "new@y.com", entity: "smith holdings l.l.c." }))).toBe(true);
  });

  it("does not match on one field alone, or on blanks", () => {
    expect(sameBorrower(original, identityFor({ name: "Pat Smith", email: "different@z.com", entity: "Different Co" }))).toBe(false);
    expect(sameBorrower(identityFor({ name: null, email: null, entity: "TBD" }), identityFor({ name: null, email: null, entity: "TBD" }))).toBe(false);
  });

  it("keeps the trailing window open for 24 months from first funding", () => {
    const first = new Date("2026-01-15T00:00:00Z");
    expect(withinTrailingWindow(first, new Date("2027-12-31T00:00:00Z"))).toBe(true);
    expect(withinTrailingWindow(first, new Date("2028-01-16T00:00:00Z"))).toBe(false);
  });
});

describe("evaluateTier", () => {
  const now = new Date("2026-10-15T00:00:00Z");

  it("earns 25% at three first deals in the trailing 12 months, held for 12 months", () => {
    const r = evaluateTier({ tier: 20, tierEarnedAt: null, tierStickyUntil: null }, 3, now);
    expect(r).toMatchObject({ tier: 25, change: "earned" });
    expect(r.tierStickyUntil?.toISOString().slice(0, 10)).toBe("2027-10-15");
  });

  it("stays at 20% below three", () => {
    expect(evaluateTier({ tier: 20, tierEarnedAt: null, tierStickyUntil: null }, 2, now).tier).toBe(20);
  });

  it("holds 25% through the sticky period regardless of count", () => {
    const state = { tier: 25, tierEarnedAt: new Date("2026-06-01T00:00:00Z"), tierStickyUntil: new Date("2027-06-01T00:00:00Z") };
    expect(evaluateTier(state, 0, now)).toMatchObject({ tier: 25, change: null, atRisk: false });
  });

  it("flags at-risk in the last 90 days of the sticky period when below two", () => {
    const state = { tier: 25, tierEarnedAt: new Date("2025-11-15T00:00:00Z"), tierStickyUntil: new Date("2026-11-15T00:00:00Z") };
    expect(evaluateTier(state, 1, now)).toMatchObject({ tier: 25, atRisk: true });
    expect(evaluateTier(state, 2, now)).toMatchObject({ tier: 25, atRisk: false });
  });

  it("after the sticky period keeps 25% at two, drops below", () => {
    const state = { tier: 25, tierEarnedAt: new Date("2025-01-01T00:00:00Z"), tierStickyUntil: new Date("2026-01-01T00:00:00Z") };
    expect(evaluateTier(state, 2, now)).toMatchObject({ tier: 25, change: null });
    expect(evaluateTier(state, 1, now)).toMatchObject({ tier: 20, change: "dropped" });
  });
});

describe("partner-facing stages", () => {
  it("maps internal stages to the spec's table", () => {
    expect(partnerStageFor("new")).toBe("submitted");
    for (const s of ["rate_shopping", "term_sheet", "negotiation"]) expect(partnerStageFor(s)).toBe("pricing");
    for (const s of ["application", "initial_app_review"]) expect(partnerStageFor(s)).toBe("application");
    for (const s of ["underwriting_review", "conditional_approval"]) expect(partnerStageFor(s)).toBe("underwriting");
    expect(partnerStageFor("clear_to_close")).toBe("clear_to_close");
    expect(partnerStageFor("closed")).toBe("closed");
    for (const s of ["on_hold", "follow_up"]) expect(partnerStageFor(s)).toBe("paused");
    for (const s of ["lost", "disqualified"]) expect(partnerStageFor(s)).toBe("didnt_proceed");
  });

  it("makes internal moves invisible: Rate Shopping <-> Negotiation is the same partner stage", () => {
    expect(partnerStageFor("rate_shopping")).toBe(partnerStageFor("negotiation"));
  });
});

describe("referralSlugFrom", () => {
  it("builds a readable slug from the name, falling back to the email", () => {
    expect(referralSlugFrom("Jane O'Smith", "jane@x.com")).toBe("jane-o-smith");
    expect(referralSlugFrom(null, "jane.smith@x.com")).toBe("jane-smith");
  });
});
