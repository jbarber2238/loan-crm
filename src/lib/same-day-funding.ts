// A request counts as same-day funding when the borrower needs the money
// today, or it comes in after the 4:00 PM Eastern cutoff the day before the
// closing — there isn't a normal day to turn it around. Judged in Eastern
// time, whatever time zone the borrower (or the server) is in.

export const SAME_DAY_CUTOFF_HOUR_ET = 16;
const TIME_ZONE = "America/New_York";

function easternParts(now: Date): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { day: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

function addDays(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today's date in Eastern time, yyyy-mm-dd. */
export function easternToday(now: Date = new Date()): string {
  return easternParts(now).day;
}

/** closingDay is yyyy-mm-dd. */
export function isSameDayFundingByTiming(closingDay: string, now: Date = new Date()): boolean {
  const { day, hour } = easternParts(now);
  if (closingDay === day) return true;
  return closingDay === addDays(day, 1) && hour >= SAME_DAY_CUTOFF_HOUR_ET;
}
