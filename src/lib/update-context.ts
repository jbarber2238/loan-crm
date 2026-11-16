// What "Pull Client Need Context" adds to the Where we stand part of an end-of-day update: the appraisal, insurance
// and title status, then the key dates. Pure, so the wording and order are easy to test.

import { formatDayShort } from "@/lib/doc-facts";

export const STAND_CONTEXT_HEADING = "KEY DATES AND STATUS:";

export interface TrackedItem {
  /** Latest logged status ("Scheduled", "Received"…), or null when nothing is logged yet. */
  status: string | null;
  /** YYYY-MM-DD the status took effect. */
  day: string | null;
  notes: string | null;
}

export interface StandContextInput {
  appraisal: TrackedItem;
  insurance: TrackedItem;
  title: TrackedItem;
  estimatedClosingDay: string | null;
  rateLockExpiresDay: string | null;
  payoffExpirationDay: string | null;
  creditPullDay: string | null;
  clearToCloseDay: string | null;
  closedDay: string | null;
}

const MAX_NOTE = 160;

function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_NOTE ? `${flat.slice(0, MAX_NOTE - 1).trimEnd()}…` : flat;
}

function itemLine(label: string, item: TrackedItem): string {
  const head = item.status ? `${label}: ${item.status}${item.day ? ` (${formatDayShort(item.day)})` : ""}` : `${label}: Not ordered`;
  return item.notes?.trim() ? `${head}. ${oneLine(item.notes)}` : head;
}

export function standContextLines(input: StandContextInput): string[] {
  const lines = [itemLine("Appraisal", input.appraisal), itemLine("Insurance (HOI)", input.insurance), itemLine("Title", input.title)];
  const dates: [string, string | null][] = [
    ["Est. closing", input.estimatedClosingDay],
    ["Rate lock expires", input.rateLockExpiresDay],
    ["Payoff expires", input.payoffExpirationDay],
    ["Credit pulled", input.creditPullDay],
    ["Clear to Close", input.clearToCloseDay],
    ["Closed", input.closedDay],
  ];
  for (const [label, day] of dates) if (day) lines.push(`${label}: ${formatDayShort(day)}`);
  return lines;
}
