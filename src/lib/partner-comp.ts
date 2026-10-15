// Partner compensation math, tier rules, repeat-borrower matching and the
// partner-facing stage map. Pure functions: the server code (stage events,
// payouts, the monthly tier job) and the portal both build on these.

import { originationFeeForPoints } from "@/lib/term-sheet-calculations";

export const FIRST_DEAL_RATES = { 20: 20, 25: 25 } as const;
export const TRAILING_RATE = 10; // percent of the broker fee on a referred borrower's repeat deals
export const TRAILING_MONTHS = 24;
export const TIER_EARN_COUNT = 3; // funded first-deals in the trailing 12 months to earn 25%
export const TIER_KEEP_COUNT = 2; // ... and to keep it
export const TIER_STICKY_MONTHS = 12;
export const TIER_AT_RISK_DAYS = 90;
// Before a term sheet is signed we only know the loan will carry roughly
// 1.5–2.5 points, so the payout is shown as a range.
export const ESTIMATE_LOW_POINTS = 1.5;
export const ESTIMATE_HIGH_POINTS = 2.5;

const cents = (n: number) => Math.round(n * 100) / 100;

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

export function firstDealRate(tier: number): number {
  return tier === 25 ? 25 : 20;
}

export function payoutRate(kind: "first" | "trailing", tier: number): number {
  return kind === "trailing" ? TRAILING_RATE : firstDealRate(tier);
}

/** The partner's cut of the broker fee. The $2,500 minimum origination fee is what makes 20% come out to $500. */
export function partnerPayoutAmount(feeBasis: number, ratePercent: number): number {
  return cents((feeBasis * ratePercent) / 100);
}

export type PayoutEstimate =
  | { kind: "range"; low: number; high: number }
  | { kind: "exact"; amount: number }
  | { kind: "final"; amount: number };

/**
 * What a referral is worth to the partner, at the best precision available:
 * a range off the requested loan until a term sheet is signed, exact once the
 * approved loan and points are known, final once the fee is actually collected.
 */
export function estimatePayout(input: {
  ratePercent: number;
  loanAmountRequested: number;
  approvedLoanAmount: number | null;
  originationPointsOverride: number | null;
  brokerFeeCollected: number | null;
}): PayoutEstimate {
  const { ratePercent } = input;
  if (input.brokerFeeCollected !== null && input.brokerFeeCollected > 0) {
    return { kind: "final", amount: partnerPayoutAmount(input.brokerFeeCollected, ratePercent) };
  }
  if (input.approvedLoanAmount !== null && input.approvedLoanAmount > 0) {
    const fee = originationFeeForPoints(input.approvedLoanAmount, input.originationPointsOverride ?? 2);
    return { kind: "exact", amount: partnerPayoutAmount(fee, ratePercent) };
  }
  const low = originationFeeForPoints(input.loanAmountRequested, ESTIMATE_LOW_POINTS);
  const high = originationFeeForPoints(input.loanAmountRequested, ESTIMATE_HIGH_POINTS);
  return { kind: "range", low: partnerPayoutAmount(low, ratePercent), high: partnerPayoutAmount(high, ratePercent) };
}

export function formatPayoutEstimate(e: PayoutEstimate): string {
  const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
  if (e.kind === "range") return e.low === e.high ? `${money(e.low)} (estimated)` : `${money(e.low)}–${money(e.high)} (estimated range)`;
  if (e.kind === "exact") return `${money(e.amount)} (estimated)`;
  return money(e.amount);
}

// ---- repeat-borrower matching -------------------------------------------

const ENTITY_SUFFIXES = new Set([
  "llc", "inc", "incorporated", "corp", "corporation", "co", "company", "ltd", "lp", "llp", "pllc", "lc", "the",
]);

export function normalizeName(value: string | null | undefined): string | null {
  // Periods and apostrophes vanish ("L.L.C." -> "llc", "O'Neil" -> "oneil"); other punctuation is a space.
  const v = (value ?? "").toLowerCase().replace(/[.'’]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return v || null;
}

export function normalizeEntity(value: string | null | undefined): string | null {
  const words = (normalizeName(value) ?? "").split(" ").filter((w) => w && !ENTITY_SUFFIXES.has(w));
  const v = words.join(" ");
  return v && v !== "tbd" ? v : null;
}

export function normalizeEmail(value: string | null | undefined): string | null {
  const v = (value ?? "").trim().toLowerCase();
  return v || null;
}

export interface BorrowerIdentity {
  name: string | null;
  email: string | null;
  entity: string | null;
}

export function identityFor(raw: { name?: string | null; email?: string | null; entity?: string | null }): BorrowerIdentity {
  return { name: normalizeName(raw.name), email: normalizeEmail(raw.email), entity: normalizeEntity(raw.entity) };
}

/** The same borrower if at least two of name, email and entity match (blanks never match). */
export function sameBorrower(a: BorrowerIdentity, b: BorrowerIdentity): boolean {
  let matches = 0;
  if (a.name && a.name === b.name) matches++;
  if (a.email && a.email === b.email) matches++;
  if (a.entity && a.entity === b.entity) matches++;
  return matches >= 2;
}

export function withinTrailingWindow(firstFundedAt: Date, now: Date = new Date()): boolean {
  return now < addMonths(firstFundedAt, TRAILING_MONTHS);
}

// ---- tier maintenance ----------------------------------------------------

export interface TierState {
  tier: number;
  tierEarnedAt: Date | null;
  tierStickyUntil: Date | null;
}

export interface TierEvaluation {
  tier: number;
  tierEarnedAt: Date | null;
  tierStickyUntil: Date | null;
  change: "earned" | "dropped" | null;
  /** True during the last 90 days of the sticky period when the partner is below the keep count. */
  atRisk: boolean;
}

/**
 * Monthly tier evaluation. Earn 25% at 3 funded first-deals in the trailing 12
 * months; once earned it is held for 12 months; afterwards it is kept only with
 * 2+ in the trailing 12 months. `firstDealsLast12Months` counts distinct
 * referred borrowers whose first deal funded in that window.
 */
export function evaluateTier(state: TierState, firstDealsLast12Months: number, now: Date = new Date()): TierEvaluation {
  if (state.tier !== 25) {
    if (firstDealsLast12Months >= TIER_EARN_COUNT) {
      return {
        tier: 25,
        tierEarnedAt: now,
        tierStickyUntil: addMonths(now, TIER_STICKY_MONTHS),
        change: "earned",
        atRisk: false,
      };
    }
    return { tier: 20, tierEarnedAt: null, tierStickyUntil: null, change: null, atRisk: false };
  }

  const sticky = state.tierStickyUntil;
  if (sticky && now < sticky) {
    const daysLeft = (sticky.getTime() - now.getTime()) / 86_400_000;
    return {
      tier: 25,
      tierEarnedAt: state.tierEarnedAt,
      tierStickyUntil: sticky,
      change: null,
      atRisk: daysLeft <= TIER_AT_RISK_DAYS && firstDealsLast12Months < TIER_KEEP_COUNT,
    };
  }
  if (firstDealsLast12Months >= TIER_KEEP_COUNT) {
    return { tier: 25, tierEarnedAt: state.tierEarnedAt, tierStickyUntil: sticky, change: null, atRisk: false };
  }
  return { tier: 20, tierEarnedAt: null, tierStickyUntil: null, change: "dropped", atRisk: false };
}

// ---- partner-facing stages ----------------------------------------------

export type PartnerStage =
  | "submitted"
  | "pricing"
  | "application"
  | "underwriting"
  | "clear_to_close"
  | "closed"
  | "paused"
  | "didnt_proceed";

export const PARTNER_STAGE_LABELS: Record<PartnerStage, string> = {
  submitted: "Submitted",
  pricing: "Pricing & Terms",
  application: "Application",
  underwriting: "Underwriting",
  clear_to_close: "Clear to Close",
  closed: "Closed",
  paused: "Paused — still in play",
  didnt_proceed: "Didn't proceed",
};

// The six-step happy path shown as a stepper.
export const PARTNER_STAGE_STEPS: PartnerStage[] = [
  "submitted",
  "pricing",
  "application",
  "underwriting",
  "clear_to_close",
  "closed",
];

const STAGE_MAP: Record<string, PartnerStage> = {
  new: "submitted",
  rate_shopping: "pricing",
  term_sheet: "pricing",
  negotiation: "pricing",
  application: "application",
  initial_app_review: "application",
  underwriting_review: "underwriting",
  processing: "underwriting",
  conditional_approval: "underwriting",
  clear_to_close: "clear_to_close",
  closed: "closed",
  on_hold: "paused",
  follow_up: "paused",
  lost: "didnt_proceed",
  disqualified: "didnt_proceed",
};

/** Maps an internal pipeline stage to what a partner is allowed to see. Display only — not a new CRM stage. */
export function partnerStageFor(internalStage: string): PartnerStage {
  return STAGE_MAP[internalStage] ?? "submitted";
}

export const PAUSED_MICROCOPY = "We're staying on this — you'll see it move the moment it does.";

export function referralSlugFrom(name: string | null | undefined, email: string): string {
  const base = (name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const fallback = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (base || fallback || "partner").slice(0, 40);
}
