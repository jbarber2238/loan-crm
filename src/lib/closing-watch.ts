import { addDays, etDay } from "@/lib/friday-schedule";

// How close to its estimated closing date a deal has to be to show up as "due
// soon" on the dashboard's Closing Watch list.
export const CLOSING_SOON_DAYS = 3;

export type ClosingWatchStatus = "overdue" | "soon" | "no_date";

/**
 * Closing dates are saved as the chosen calendar day at midnight UTC, so the
 * day a person picked is the ISO date. "Today" is today in Eastern time, the
 * business's own clock, so a deal doesn't tip into overdue at 7 PM the evening
 * before its date.
 */
function dayNumber(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/** Whole days from today to the closing day. 0 = today, negative = already past. */
export function closingDayOffset(closing: Date, now: Date = new Date()): number {
  return dayNumber(closing.toISOString().slice(0, 10)) - dayNumber(etDay(now));
}

/** Start of today (Eastern), in the same midnight-UTC form closing dates are stored in. */
export function startOfEtToday(now: Date = new Date()): Date {
  return new Date(`${etDay(now)}T00:00:00.000Z`);
}

/** Null when the deal's date is fine: more than CLOSING_SOON_DAYS days away. */
export function closingWatchStatus(
  closing: Date | null,
  now: Date = new Date()
): { status: ClosingWatchStatus; offset: number | null } | null {
  if (!closing) return { status: "no_date", offset: null };
  const offset = closingDayOffset(closing, now);
  if (offset < 0) return { status: "overdue", offset };
  if (offset <= CLOSING_SOON_DAYS) return { status: "soon", offset };
  return null;
}

export function closingWatchLabel(status: ClosingWatchStatus, offset: number | null): string {
  if (status === "no_date" || offset === null) return "No Estimated Closing Date";
  if (status === "overdue") return "Past Estimated Closing Date";
  if (offset === 0) return "Estimated Closing Date is today";
  return `${offset} ${offset === 1 ? "day" : "days"} from Estimated Closing Date`;
}

// Re-exported so callers that only need day math don't reach into the Friday module.
export { addDays };
