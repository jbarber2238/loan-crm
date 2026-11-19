// Rules for the Borrower Experience part of the intake form. A flip or new construction only counts when it is
// finished (bought and on title, renovated or built, then sold or refinanced), so the borrower has to confirm that
// before we price on it. A single rental needs a purchase date, because lenders look at how long it has been owned.

export interface ExperienceCounts {
  numFlips: number | null;
  numNewConstruction: number | null;
}

/** True when the borrower entered flips or new construction, which is what has to be confirmed. */
export function hasExperienceToConfirm(c: ExperienceCounts): boolean {
  return (c.numFlips ?? 0) > 0 || (c.numNewConstruction ?? 0) > 0;
}

/** True when there is something to confirm and the borrower has not confirmed it. */
export function needsExperienceConfirmation(c: ExperienceCounts & { confirmed: boolean }): boolean {
  return hasExperienceToConfirm(c) && !c.confirmed;
}

/** "2026-03" (a month input) as the first of that month, or null for anything else. Stored in UTC so it never slips a month. */
export function parseMonthInput(value: string | null | undefined): Date | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec((value ?? "").trim());
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
}

/** The reverse, for a month input's value. */
export function toMonthInput(d: Date | null | undefined): string {
  if (!d) return "";
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Whole calendar months from the purchase month to now; negative when the date is in the future. */
export function monthsOwned(since: Date, now: Date = new Date()): number {
  return (now.getFullYear() - since.getUTCFullYear()) * 12 + (now.getMonth() - since.getUTCMonth());
}

/** "under a month", "8 months", "3 years". */
export function describeOwned(months: number): string {
  if (months < 1) return "under a month";
  if (months === 1) return "1 month";
  if (months < 24) return `${months} months`;
  return `${Math.floor(months / 12)} years`;
}

/** "You have owned it about 8 months." for the borrower, shared by the intake form and the deal Overview. */
export function ownedSentence(months: number): string {
  if (months < 0) return "That date is in the future. Check the month and year.";
  return `You have owned it ${months < 1 ? "less than a month" : `about ${describeOwned(months)}`}.`;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Mar 2026". */
export function formatMonthYear(d: Date): string {
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "1 rental, owned since Mar 2026 (8 months)", or just the count when there is no single-rental date to show. */
export function rentalSummary(numRentals: number | null, since: Date | null, now: Date = new Date()): string {
  if (numRentals === null) return "not provided";
  const count = `${numRentals} ${numRentals === 1 ? "rental" : "rentals"}`;
  if (numRentals !== 1 || !since) return count;
  const months = monthsOwned(since, now);
  return months < 0 ? `${count}, owned since ${formatMonthYear(since)}` : `${count}, owned since ${formatMonthYear(since)} (${describeOwned(months)})`;
}
