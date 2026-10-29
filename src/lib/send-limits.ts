// Daily sending limits and campaign health. Pure, so the rules are testable.
//
// Gmail caps how many emails an account can send in a rolling 24 hours (about 500 for a free account, about
// 2,000 for Google Workspace). Going over blocks sending for around a day, and sending lots of mail that bounces
// or gets unsubscribed marks an account as a likely spammer. These rules keep campaigns well inside both.

export const ACCOUNT_TYPES = [
  { value: "free", label: "Free Gmail (@gmail.com)", limit: 500 },
  { value: "workspace", label: "Google Workspace (business email)", limit: 2000 },
  { value: "custom", label: "Other: I'll enter the number", limit: null },
] as const;

export type AccountType = (typeof ACCOUNT_TYPES)[number]["value"];

export const DEFAULT_LIMITS = { accountType: "workspace" as AccountType, dailyLimit: 2000, campaignDailyMax: 200, minDaysBetween: 3 };

/** Campaigns never push the account past this share of its daily limit; the rest is kept for everyday email. */
export const HARD_STOP_FRACTION = 0.9;
/** The in-app alert fires when the account has used this share. */
export const WARN_FRACTION = 0.7;

export interface SendLimitsInput {
  /** Emails the account sent in the last 24 hours, counting every recipient, from the CRM. */
  used24h: number;
  dailyLimit: number;
  /** Of those, how many were campaign emails. */
  campaignUsed24h: number;
  campaignDailyMax: number;
}

export type CapLevel = "ok" | "watch" | "near" | "full";

export interface CapStatus {
  level: CapLevel;
  /** Share of the daily limit used, 0 to 100+. */
  pct: number;
  /** The most campaigns may still send right now: bounded by the campaign cap and by the hard stop. */
  campaignRoom: number;
  hardStop: number;
}

export function capStatus(i: SendLimitsInput): CapStatus {
  const hardStop = Math.floor(i.dailyLimit * HARD_STOP_FRACTION);
  const pct = i.dailyLimit > 0 ? (i.used24h / i.dailyLimit) * 100 : 100;
  const level: CapLevel = i.used24h >= hardStop ? "full" : pct >= 80 ? "near" : pct >= WARN_FRACTION * 100 ? "watch" : "ok";
  const campaignRoom = Math.max(0, Math.min(i.campaignDailyMax - i.campaignUsed24h, hardStop - i.used24h));
  return { level, pct, campaignRoom, hardStop };
}

export interface Projection {
  /** Whether everyone could go out today. */
  fitsToday: boolean;
  /** Roughly how many days it'd take at the daily room available. */
  days: number;
  message: string;
}

/** Plain-English forecast for sending to `recipients` people on top of what has already gone out. */
export function projectSend(i: SendLimitsInput, recipients: number): Projection {
  const s = capStatus(i);
  const perDay = Math.max(1, Math.min(i.campaignDailyMax, s.hardStop));
  const fitsToday = recipients <= s.campaignRoom;
  const days = fitsToday ? 1 : Math.ceil(Math.max(0, recipients - s.campaignRoom) / perDay) + (s.campaignRoom > 0 ? 1 : 1);
  const message = fitsToday
    ? `${recipients} ${recipients === 1 ? "email fits" : "emails fit"} within today's room (${s.campaignRoom} left for campaigns).`
    : `Only ${s.campaignRoom} more campaign ${s.campaignRoom === 1 ? "email fits" : "emails fit"} right now, so this would spread over about ${days} days (up to ${i.campaignDailyMax} a day).`;
  return { fitsToday, days, message };
}

// ---- campaign health --------------------------------------------------------------------------------

export interface CampaignCounts {
  sent: number;
  failed: number;
  bounced: number;
  unsubscribed: number;
  clicked: number;
}

/** Below this many emails a rate means little, so only a pile-up of bounces triggers a warning. */
export const MIN_SAMPLE = 20;

export const THRESHOLDS = {
  bounceWatch: 2,
  bouncePause: 5,
  failWatch: 2,
  failPause: 5,
  unsubWatch: 1,
  unsubPause: 3,
};

export const rate = (n: number, of: number): number => (of > 0 ? (n / of) * 100 : 0);

export interface Health {
  level: "ok" | "watch" | "pause";
  reasons: string[];
}

const fmt = (n: number) => `${n.toFixed(1).replace(/\.0$/, "")}%`;

/** Whether a campaign's numbers are healthy, worth watching, or bad enough that sending should stop by itself. */
export function campaignHealth(c: CampaignCounts): Health {
  const attempted = c.sent + c.failed;
  const reasons: string[] = [];
  let level: Health["level"] = "ok";
  const raise = (to: Health["level"], reason: string) => {
    reasons.push(reason);
    if (to === "pause" || level === "ok") level = to;
  };
  const bounce = rate(c.bounced, c.sent);
  const fail = rate(c.failed, attempted);
  const unsub = rate(c.unsubscribed, c.sent);
  if (attempted >= MIN_SAMPLE) {
    if (bounce >= THRESHOLDS.bouncePause) raise("pause", `${fmt(bounce)} bounced (stops at ${THRESHOLDS.bouncePause}%)`);
    else if (bounce >= THRESHOLDS.bounceWatch) raise("watch", `${fmt(bounce)} bounced (watch above ${THRESHOLDS.bounceWatch}%)`);
    if (fail >= THRESHOLDS.failPause) raise("pause", `${fmt(fail)} couldn't be sent (stops at ${THRESHOLDS.failPause}%)`);
    else if (fail >= THRESHOLDS.failWatch) raise("watch", `${fmt(fail)} couldn't be sent`);
    if (unsub >= THRESHOLDS.unsubPause) raise("pause", `${fmt(unsub)} unsubscribed (stops at ${THRESHOLDS.unsubPause}%)`);
    else if (unsub >= THRESHOLDS.unsubWatch) raise("watch", `${fmt(unsub)} unsubscribed (watch above ${THRESHOLDS.unsubWatch}%)`);
  } else if (c.bounced >= 3) {
    raise("watch", `${c.bounced} bounces already, early in the send`);
  }
  return { level, reasons };
}
