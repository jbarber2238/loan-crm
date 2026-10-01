// Every deal's client-needs reminder fires at this one fixed Eastern
// wall-clock time each day it's due, rather than N hours after whenever the
// first send happened to go out — sending right before the start of the
// workday (rather than at a random hour that drifts to match the original
// send time) is meant to put this at the top of someone's inbox when they
// first check it.
export const REMINDER_HOUR_ET = 7;
export const REMINDER_MINUTE_ET = 0;
export const REMINDER_TIME_ZONE = "America/New_York";

const HOUR_MS = 60 * 60 * 1000;

// Intl's formatToParts, not a fixed UTC offset — so this is always 7:00 AM on
// the actual Eastern wall clock, correctly shifting across the EST/EDT
// daylight-saving change rather than silently becoming 6 or 8 AM for half
// the year.
export function easternParts(date: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: REMINDER_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  // Some ICU implementations render midnight as hour "24" under hour12:false.
  const hour = get("hour") % 24;
  return { year: get("year"), month: get("month"), day: get("day"), hour, minute: get("minute") };
}

// A plain incrementing day number in Eastern local time, so "how many
// calendar days apart" is simple subtraction regardless of each date's own
// time-of-day.
export function easternDayNumber(date: Date): number {
  const { year, month, day } = easternParts(date);
  return Date.UTC(year, month - 1, day) / (24 * HOUR_MS);
}

export interface ReminderDueCheck {
  due: boolean;
  /** How many more calendar days (0 if due today but not yet past the fixed time) until this would become due. */
  daysUntilDue: number;
}

// Day-count, not elapsed hours: due at REMINDER_HOUR_ET on the Nth Eastern
// calendar day after baseline, regardless of what time of day baseline
// itself fell on. intervalHours is the stored unit (24/48/72/168, for
// backward compatibility with existing deal settings) — reinterpreted here
// as a day count. Even when overdue by more than intervalDays (e.g. a missed
// cron run), this still waits for the next REMINDER_HOUR_ET rather than
// firing at an off-hour — the whole point is a consistent, predictable time.
export function checkReminderDue(baseline: Date, now: Date, intervalHours: number): ReminderDueCheck {
  const intervalDays = Math.max(1, Math.round(intervalHours / 24));
  const daysSinceBaseline = easternDayNumber(now) - easternDayNumber(baseline);
  const nowET = easternParts(now);
  const pastFixedTimeToday =
    nowET.hour > REMINDER_HOUR_ET || (nowET.hour === REMINDER_HOUR_ET && nowET.minute >= REMINDER_MINUTE_ET);

  if (daysSinceBaseline < intervalDays) {
    return { due: false, daysUntilDue: intervalDays - daysSinceBaseline };
  }
  // On or past the due day — still gated on the fixed time, no matter how
  // many days overdue (a missed cron run shouldn't fire at 3 AM just because
  // it's now technically several days late).
  if (!pastFixedTimeToday) {
    return { due: false, daysUntilDue: 0 };
  }
  return { due: true, daysUntilDue: 0 };
}
