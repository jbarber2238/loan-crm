// DSCR loans need time to close. When the closing date a borrower enters is closer than this, they are warned on the
// intake form, and the deal Overview flags it for whoever reviews the deal.

export const DSCR_MIN_CLOSING_DAYS = 30;

const DSCR_CATEGORIES = new Set(["dscr_purchase", "dscr_cash_out_refinance", "dscr_rate_term_refinance"]);

export function isDscrCategory(category: string | null | undefined): boolean {
  return DSCR_CATEGORIES.has(category ?? "");
}

/** Calendar days from one "YYYY-MM-DD" date to another; negative when the second is earlier. */
export function daysBetween(fromDate: string, toDate: string): number {
  const a = Date.parse(`${fromDate}T00:00:00Z`);
  const b = Date.parse(`${toDate}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  return Math.round((b - a) / 86_400_000);
}

/** Today's date on the user's own calendar, as "YYYY-MM-DD" (for the browser). */
export function localDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A moment as an Eastern Time "YYYY-MM-DD" (the business runs on ET), for when a deal was submitted. */
export function easternDateKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/**
 * How many days out a DSCR loan's closing date is, when that is under the minimum; null when it is fine, there is no
 * date, or the loan isn't a DSCR loan.
 */
export function dscrClosingTooSoon(category: string | null | undefined, closingDate: string | null | undefined, fromDate: string): number | null {
  if (!isDscrCategory(category) || !closingDate) return null;
  const days = daysBetween(fromDate, closingDate);
  return Number.isNaN(days) || days >= DSCR_MIN_CLOSING_DAYS ? null : days;
}

/** "That date is 12 days from today." / "...is today." / "...has already passed." */
export function daysAwayPhrase(days: number): string {
  if (days < 0) return "That date has already passed.";
  if (days === 0) return "That date is today.";
  return `That date is ${days} ${days === 1 ? "day" : "days"} from today.`;
}

/** For staff on the Overview, measured from when the deal was submitted: "Only 12 days after this deal was submitted." */
export function submittedGapPhrase(days: number): string {
  if (days < 0) return "The closing date was already past when this deal was submitted.";
  if (days === 0) return "The closing date was the same day this deal was submitted.";
  return `The closing date is only ${days} ${days === 1 ? "day" : "days"} after this deal was submitted.`;
}
