// Pure, dependency-free functions for the leads pipeline — kept separate
// from the server actions that call them so they're trivially unit
// testable without a database.

export type LeadStatus = "new" | "engaged" | "hot" | "contacted" | "nurture" | "converted" | "dead";

export function computeCashInvested(totalProjectCost: number, loanAmount: number): number {
  return totalProjectCost - loanAmount;
}

export function computeCashOnCashReturnPct(profit: number, cashInvested: number): number {
  if (cashInvested <= 0) return 0;
  return (profit / cashInvested) * 100;
}

export type LeadEvent =
  | { kind: "calculator_used" }
  | { kind: "excel_downloaded" }
  | { kind: "deal_under_contract"; value: boolean }
  | { kind: "closing_timeline"; days: number | null }
  | { kind: "cta_clicked"; tier: "below_target" | "getting_close" | "on_target" };

// Once a human has manually moved a lead to one of these, an automated
// engagement signal (using the calculator again, downloading the Excel)
// should never quietly revert it back down the ladder — but a fresh "hot"
// signal (yes to a deal under contract, a fast closing timeline, clicking
// the strongest CTA) is real new information and is still allowed through,
// even from Nurture, since that's exactly the lead a re-engagement should
// surface. Converted/Dead are terminal either way.
const AUTO_ENGAGEMENT_ELIGIBLE = new Set<LeadStatus>(["new"]);
const HOT_ELIGIBLE = new Set<LeadStatus>(["new", "engaged", "contacted", "nurture"]);
const CLOSING_SOON_DAYS = 30;

/** Returns the new status, or null if this event shouldn't change it. */
export function computeStatusAfterEvent(current: LeadStatus, event: LeadEvent): LeadStatus | null {
  switch (event.kind) {
    case "calculator_used":
    case "excel_downloaded":
      return AUTO_ENGAGEMENT_ELIGIBLE.has(current) ? "engaged" : null;
    case "deal_under_contract":
      return event.value && HOT_ELIGIBLE.has(current) ? "hot" : null;
    case "closing_timeline":
      return event.days !== null && event.days <= CLOSING_SOON_DAYS && HOT_ELIGIBLE.has(current) ? "hot" : null;
    case "cta_clicked":
      return event.tier === "on_target" && HOT_ELIGIBLE.has(current) ? "hot" : null;
    default:
      return null;
  }
}

/** "45 days", "3 weeks", "ASAP" — anything without a clear number of days reads as "not close enough to auto-flag as hot," which is the safe default. */
export function parseClosingTimelineDays(timeline: string | null): number | null {
  if (!timeline) return null;
  const normalized = timeline.trim().toLowerCase();
  if (normalized.includes("asap") || normalized.includes("immediately")) return 0;
  const weekMatch = normalized.match(/(\d+)\s*week/);
  if (weekMatch) return Number(weekMatch[1]) * 7;
  const monthMatch = normalized.match(/(\d+)\s*month/);
  if (monthMatch) return Number(monthMatch[1]) * 30;
  const dayMatch = normalized.match(/(\d+)\s*day/);
  if (dayMatch) return Number(dayMatch[1]);
  const bareNumber = normalized.match(/^(\d+)$/);
  if (bareNumber) return Number(bareNumber[1]);
  return null;
}
