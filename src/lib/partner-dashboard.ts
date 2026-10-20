import { type PartnerStage, partnerPayoutAmount } from "@/lib/partner-comp";
import { originationFeeForPoints } from "@/lib/term-sheet-calculations";

// The portal shows four plain-language steps instead of the full pipeline.
export type StageBucket = "submitted" | "review" | "closing" | "funded" | "paused" | "didnt_proceed";

export const BUCKET_LABELS: Record<StageBucket, string> = {
  submitted: "Submitted",
  review: "In review",
  closing: "Closing",
  funded: "Funded",
  paused: "Paused",
  didnt_proceed: "Didn't proceed",
};

export function bucketFor(stage: PartnerStage): StageBucket {
  switch (stage) {
    case "submitted":
      return "submitted";
    case "pricing":
    case "application":
    case "underwriting":
      return "review";
    case "clear_to_close":
      return "closing";
    case "closed":
      return "funded";
    case "paused":
      return "paused";
    default:
      return "didnt_proceed";
  }
}

/** "Oct 9". Event times are shown in Eastern; a date-only value (a paid date) is shown as stored, in UTC. */
export function shortDate(d: Date, timeZone = "America/New_York"): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone }).format(d);
}

export interface ActivityEvent {
  type: string;
  payload: Record<string, unknown> | null;
  dealLabel: string | null;
}

/** One line of the Recent Activity list, or null for events a partner has no use for (logins, internal moves). */
export function activityLine(e: ActivityEvent): { text: string; paid: boolean } | null {
  const who = e.dealLabel ?? "A referral";
  if (e.type === "referral_submitted") return { text: `${who} referred`, paid: false };
  if (e.type === "payout_paid") {
    const amount = Number(e.payload?.amount);
    return Number.isFinite(amount) && amount > 0
      ? { text: `$${Math.round(amount).toLocaleString("en-US")} paid to you by ACH`, paid: true }
      : { text: `A payout was sent to you by ACH`, paid: true };
  }
  if (e.type === "stage_change") {
    const to = bucketFor(String(e.payload?.to) as PartnerStage);
    const from = e.payload?.from ? bucketFor(String(e.payload.from) as PartnerStage) : null;
    if (to === from || to === "submitted") return null; // moved within a step, or nothing new to say
    if (to === "funded") return { text: `${who} funded`, paid: false };
    if (to === "paused") return { text: `${who} is paused`, paid: false };
    if (to === "didnt_proceed") return { text: `${who} didn't move forward`, paid: false };
    return { text: `${who} moved to ${BUCKET_LABELS[to]}`, paid: false };
  }
  return null;
}

/** The numbers behind the "How you get paid" band. The example assumes a 2-point origination fee on a $180,000 loan. */
export function howPaidFigures(tier: number) {
  const exampleLoan = 180_000;
  return {
    firstDealRate: tier,
    minimum: partnerPayoutAmount(2500, tier),
    exampleLoan,
    examplePayout: partnerPayoutAmount(originationFeeForPoints(exampleLoan, 2), tier),
  };
}

export const PROGRESS_STEPS = ["submitted", "review", "closing", "funded"] as const;

/** How the mini progress bar draws a referral: how many of the four boxes are filled, and whether it's stopped. */
export function stageProgress(bucket: StageBucket): { filled: number; state: "moving" | "funded" | "stopped" } {
  if (bucket === "paused" || bucket === "didnt_proceed") return { filled: 0, state: "stopped" };
  const filled = PROGRESS_STEPS.indexOf(bucket) + 1;
  return { filled, state: bucket === "funded" ? "funded" : "moving" };
}

export type ReferralView = "active" | "funded" | "stopped";

/** Which tab a referral lives under: still moving (including paused), funded, or didn't proceed. */
export function viewFor(bucket: StageBucket): ReferralView {
  if (bucket === "funded") return "funded";
  if (bucket === "didnt_proceed") return "stopped";
  return "active";
}
