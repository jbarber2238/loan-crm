// Rules for staff tasks and the end-of-day deal update. Pure, so they are easy to test. Due times are Eastern
// wall-clock times (the team's time zone everywhere else in the app).

import { etDay, etParts, FRIDAY_TZ } from "@/lib/friday-schedule";

export const TASK_TIME_ZONE = FRIDAY_TZ;
export const REMINDER_MODES = ["now", "both", "off"] as const;
export type ReminderMode = (typeof REMINDER_MODES)[number];

export const MAX_TASK_TITLE = 200;

/** A heads-up this long before the due time, for people who chose "15 minutes before". */
export const HEADS_UP_MS = 15 * 60_000;
/** A task more than this late no longer pops up when someone opens the CRM; it just shows as overdue. */
export const LATE_REMINDER_WINDOW_MS = 12 * 60 * 60_000;
/** Within this long of the due time a pop-up reads "Due now"; after that, "Was due …". */
export const NOW_WINDOW_MS = 15 * 60_000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isDateString(v: unknown): v is string {
  if (typeof v !== "string" || !DATE_RE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function isTimeString(v: unknown): v is string {
  return typeof v === "string" && TIME_RE.test(v);
}

/** Today's calendar day in Eastern, as YYYY-MM-DD. */
export function todayEt(now = new Date()): string {
  return etDay(now);
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/** Whole days from `a` to `b` (both YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** The exact moment an Eastern wall-clock date + time falls on, or null when either is missing. */
export function dueAtFrom(date: string | null, time: string | null): Date | null {
  if (!date || !time || !isDateString(date) || !isTimeString(time)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const offsetAt = (instant: number) => {
    const p = etParts(new Date(instant));
    return Date.UTC(p.y, p.m - 1, p.d, p.hour, p.minute) - Math.floor(instant / 60_000) * 60_000;
  };
  const first = offsetAt(wall);
  let instant = wall - first;
  const second = offsetAt(instant);
  if (second !== first) instant = wall - second;
  return new Date(instant);
}

export type DueBucket = "overdue" | "today" | "week" | "later" | "none";

export function dueBucket(dueDate: string | null, today: string): DueBucket {
  if (!dueDate) return "none";
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "today";
  if (dueDate <= addDays(today, 7)) return "week";
  return "later";
}

export const BUCKET_LABEL: Record<DueBucket, string> = {
  overdue: "Overdue",
  today: "Today",
  week: "This week",
  later: "Later",
  none: "No due date",
};
export const BUCKET_ORDER: DueBucket[] = ["overdue", "today", "week", "later", "none"];

export function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export function formatDay(day: string, opts: { weekday?: boolean } = {}): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(opts.weekday ? { weekday: "short" } : {}),
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** The chip text for a task's due date/time: "Overdue · 2d", "Due today · 3:00 PM", "Tomorrow", "Nov 20 · 9:00 AM". */
export function dueLabel(dueDate: string | null, dueTime: string | null, today: string): { text: string; tone: "bad" | "warn" | "muted" } {
  if (!dueDate) return { text: "No date", tone: "muted" };
  const diff = daysBetween(today, dueDate);
  const at = dueTime ? ` · ${formatTime(dueTime)}` : "";
  if (diff < 0) return { text: `Overdue · ${Math.abs(diff)}d`, tone: "bad" };
  if (diff === 0) return { text: `Due today${at}`, tone: "warn" };
  if (diff === 1) return { text: `Tomorrow${at}`, tone: "muted" };
  return { text: `${formatDay(dueDate)}${at}`, tone: "muted" };
}

export function taskSortKey(t: { dueDate: string | null; dueTime: string | null }): string {
  return `${t.dueDate ?? "9999-99-99"} ${t.dueTime ?? "23:59"}`;
}

export function compareTasks(a: { dueDate: string | null; dueTime: string | null }, b: { dueDate: string | null; dueTime: string | null }): number {
  const ka = taskSortKey(a);
  const kb = taskSortKey(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

export type ReminderKind = "soon" | "now" | "late";

/** What kind of pop-up (if any) a task with a due time should show right now for someone with this reminder setting. */
export function reminderKind(dueAt: Date, now: Date, mode: ReminderMode): ReminderKind | null {
  if (mode === "off") return null;
  const diff = dueAt.getTime() - now.getTime();
  if (diff > 0) return mode === "both" && diff <= HEADS_UP_MS ? "soon" : null;
  const ago = -diff;
  if (ago <= NOW_WINDOW_MS) return "now";
  if (ago <= LATE_REMINDER_WINDOW_MS) return "late";
  return null;
}

// ---- Coverage -------------------------------------------------------------------------------------------

export interface CoverageWindow {
  startDate: string;
  endDate: string;
}

export function coverageActive(c: CoverageWindow, today: string): boolean {
  return c.startDate <= today && c.endDate >= today;
}

// ---- End-of-day update ----------------------------------------------------------------------------------

export const EOD_STAND = "WHERE WE STAND:";
export const EOD_OUTSTANDING = "OUTSTANDING:";
const STAND_CONTEXT_HEADING_TEXT = "KEY DATES AND STATUS:";
export const EOD_ISSUES = "ISSUES & HOW WE’RE RESOLVING:";

/** What "Start end-of-day update" fills in. Outstanding is added by Pull Client Need Context. */
export const EOD_TEMPLATE = `${EOD_STAND}\n\n\n${EOD_ISSUES}\n`;

const OUTSTANDING_HEADING = /^OUTSTANDING:[ \t]*$/im;
const ISSUES_HEADING = /^ISSUES & HOW WE.?RE RESOLVING:[ \t]*$/im;

export function hasOutstandingSection(body: string): boolean {
  return OUTSTANDING_HEADING.test(body);
}

export function outstandingBlock(lines: string[]): string {
  return `${EOD_OUTSTANDING}\n${lines.length ? lines.map((l) => `• ${l}`).join("\n") : "Nothing. All client needs are in."}\n`;
}

/** Adds (or refreshes) the Outstanding section of an end-of-day draft, between Where we stand and the Issues. */
export function withOutstandingSection(draft: string, lines: string[]): string {
  const base = draft.trim() ? draft : EOD_TEMPLATE;
  const block = outstandingBlock(lines);
  const start = base.search(OUTSTANDING_HEADING);
  if (start >= 0) {
    const rest = base.slice(start);
    const next = rest.slice(1).search(ISSUES_HEADING);
    const end = next >= 0 ? start + 1 + next : base.length;
    return `${base.slice(0, start)}${block}\n${base.slice(end)}`.replace(/\n{4,}/g, "\n\n\n");
  }
  const issues = base.search(ISSUES_HEADING);
  if (issues >= 0) return `${base.slice(0, issues)}${block}\n${base.slice(issues)}`;
  return `${base.replace(/\s*$/, "")}\n\n${block}`;
}

const STAND_HEADING = /^WHERE WE STAND:[ \t]*$/im;
const STAND_CONTEXT = /^KEY DATES AND STATUS:[ \t]*$/im;

/**
 * Puts the appraisal / insurance / title status and key dates (`lines`) right under "Where we stand", keeping whatever
 * the processor already typed there. Pulling again replaces the earlier block instead of adding a second one.
 */
export function withStandContext(draft: string, lines: string[]): string {
  let text = draft.trim() ? draft : EOD_TEMPLATE;
  const old = text.search(STAND_CONTEXT);
  if (old >= 0) {
    const rest = text.slice(old);
    const end = rest.search(/\n[ \t]*\n/);
    text = text.slice(0, old) + (end >= 0 ? rest.slice(end).replace(/^\s*\n/, "") : "");
  }
  const block = `${STAND_CONTEXT_HEADING_TEXT}\n${lines.map((l) => `• ${l}`).join("\n")}\n`;
  const m = STAND_HEADING.exec(text);
  if (!m) return `${EOD_STAND}\n${block}\n${text.replace(/^\s+/, "")}`;
  const at = m.index + m[0].length;
  const after = text.slice(at).replace(/^\n+/, "");
  return `${text.slice(0, at)}\n${block}\n${after}`.replace(/\n{4,}/g, "\n\n\n");
}

export interface UpdateSection {
  key: "stand" | "outstanding" | "issues";
  label: string;
  text: string;
}

const SECTION_HEADINGS: { key: UpdateSection["key"]; label: string; re: RegExp }[] = [
  { key: "stand", label: "Where we stand", re: /^WHERE WE STAND:[ \t]*$/im },
  { key: "outstanding", label: "Outstanding", re: OUTSTANDING_HEADING },
  { key: "issues", label: "Issues and how we’re resolving them", re: ISSUES_HEADING },
];

/** Splits an end-of-day update into its sections, or null when it doesn't use the headings (shown as plain text then). */
export function parseUpdateSections(body: string): UpdateSection[] | null {
  const found = SECTION_HEADINGS.map((h) => {
    const m = h.re.exec(body);
    return m ? { ...h, at: m.index, end: m.index + m[0].length } : null;
  })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.at - b.at);
  if (found.length < 2) return null;
  return found.map((f, i) => ({
    key: f.key,
    label: f.label,
    text: body.slice(f.end, i + 1 < found.length ? found[i + 1].at : body.length).trim(),
  }));
}

/** Whole Eastern days since an update was posted. */
export function updateAgeDays(postedAt: Date, now = new Date()): number {
  return Math.max(0, daysBetween(etDay(postedAt), etDay(now)));
}

export type AgeTone = "ok" | "muted" | "warn" | "bad";

export function updateAgeChip(ageDays: number): { text: string; tone: AgeTone } {
  if (ageDays <= 0) return { text: "Posted today", tone: "ok" };
  if (ageDays === 1) return { text: "Posted yesterday", tone: "muted" };
  return { text: `${ageDays} days since update`, tone: ageDays >= 5 ? "bad" : "warn" };
}

/** The banner opens by itself when this person hasn't been shown it in the last 24 hours. */
export const BANNER_REOPEN_MS = 24 * 60 * 60_000;
