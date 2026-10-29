// When a marketing campaign goes out: once (now or at a set time) or on a repeat. Pure, all times Eastern.

import { addDays, etDay, etParts, etToUtc, formatClock } from "@/lib/friday-schedule";

export type RepeatEvery = "week" | "two_weeks" | "month";

export type CampaignSchedule =
  | { mode: "draft" }
  | { mode: "once"; now: true }
  | { mode: "once"; now: false; date: string; hour: number; minute: number }
  | {
      mode: "repeat";
      every: RepeatEvery;
      /** 0 = Sunday ... 6 = Saturday; used for weekly and every-two-weeks. */
      weekday: number;
      /** 1 to 28; used for monthly. */
      dayOfMonth: number;
      hour: number;
      minute: number;
      startDate: string; // YYYY-MM-DD
      endDate: string | null;
      maxRuns: number | null;
    };

export const DRAFT_SCHEDULE: CampaignSchedule = { mode: "draft" };
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Reads a stored or AI-supplied schedule, repairing nothing: returns null when it isn't usable. */
export function parseSchedule(raw: unknown): CampaignSchedule | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const int = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : null);
  if (r.mode === "draft") return { mode: "draft" };
  if (r.mode === "once") {
    if (r.now === true) return { mode: "once", now: true };
    const hour = int(r.hour, 0, 23);
    const minute = int(r.minute, 0, 59);
    if (typeof r.date === "string" && DAY_RE.test(r.date) && hour !== null && minute !== null) return { mode: "once", now: false, date: r.date, hour, minute };
    return null;
  }
  if (r.mode === "repeat") {
    const every = r.every === "week" || r.every === "two_weeks" || r.every === "month" ? r.every : null;
    const weekday = int(r.weekday, 0, 6);
    const dayOfMonth = int(r.dayOfMonth, 1, 28);
    const hour = int(r.hour, 0, 23);
    const minute = int(r.minute, 0, 59);
    if (!every || weekday === null || dayOfMonth === null || hour === null || minute === null) return null;
    if (typeof r.startDate !== "string" || !DAY_RE.test(r.startDate)) return null;
    const endDate = typeof r.endDate === "string" && DAY_RE.test(r.endDate) ? r.endDate : null;
    const maxRuns = int(r.maxRuns, 1, 1000);
    return { mode: "repeat", every, weekday, dayOfMonth, hour, minute, startDate: r.startDate, endDate, maxRuns };
  }
  return null;
}

function addMonths(day: string, n: number, dayOfMonth: number): string {
  const [y, m] = day.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-${String(dayOfMonth).padStart(2, "0")}`;
}

/** The first moment a schedule fires, at or after `now`. Null when it never will (a draft, or a repeat already past its end). */
export function firstRunAt(s: CampaignSchedule, now: Date): Date | null {
  if (s.mode === "draft") return null;
  if (s.mode === "once") return s.now ? now : etToUtc(s.date, s.hour, s.minute);
  const today = etDay(now);
  let day = s.startDate > today ? s.startDate : today;
  if (s.every === "month") {
    const [y, m] = day.split("-").map(Number);
    let candidate = `${y}-${String(m).padStart(2, "0")}-${String(s.dayOfMonth).padStart(2, "0")}`;
    if (candidate < day || etToUtc(candidate, s.hour, s.minute) < now) candidate = addMonths(day, 1, s.dayOfMonth);
    day = candidate;
  } else {
    const weekdayOfDay = (d: string) => etParts(etToUtc(d, 12)).weekday;
    while (weekdayOfDay(day) !== s.weekday) day = addDays(day, 1);
    if (etToUtc(day, s.hour, s.minute) < now) day = addDays(day, s.every === "week" ? 7 : 14);
  }
  if (s.endDate && day > s.endDate) return null;
  return etToUtc(day, s.hour, s.minute);
}

/** The run after one that just fired. Null once a once-only send is done, or a repeat hits its end date or run limit. */
export function nextRunAfter(s: CampaignSchedule, lastRun: Date, runsDone: number): Date | null {
  if (s.mode !== "repeat") return null;
  if (s.maxRuns !== null && runsDone >= s.maxRuns) return null;
  const lastDay = etDay(lastRun);
  const day = s.every === "month" ? addMonths(lastDay, 1, s.dayOfMonth) : addDays(lastDay, s.every === "week" ? 7 : 14);
  if (s.endDate && day > s.endDate) return null;
  return etToUtc(day, s.hour, s.minute);
}

function longDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/** The schedule in plain English. */
export function describeSchedule(s: CampaignSchedule): string {
  if (s.mode === "draft") return "Not scheduled yet";
  if (s.mode === "once") return s.now ? "Sends right away" : `Sends once on ${longDay(s.date)} at ${formatClock(s)} ET`;
  const time = formatClock(s);
  const cadence =
    s.every === "week"
      ? `every ${WEEKDAY_NAMES[s.weekday]}`
      : s.every === "two_weeks"
        ? `every other ${WEEKDAY_NAMES[s.weekday]}`
        : `on the ${ordinal(s.dayOfMonth)} of every month`;
  const tail = [s.endDate ? `until ${longDay(s.endDate)}` : null, s.maxRuns ? `${s.maxRuns} send${s.maxRuns === 1 ? "" : "s"} at most` : null].filter(Boolean).join(", ");
  return `Repeats ${cadence} at ${time} ET, starting ${longDay(s.startDate)}${tail ? ` (${tail})` : ""}`;
}

/** Problems with a schedule that would stop it from going out, in plain English. Empty when it's fine. */
export function scheduleProblems(s: CampaignSchedule, now: Date): string[] {
  if (s.mode === "draft") return ["Pick when it should go out."];
  if (s.mode === "once" && !s.now && etToUtc(s.date, s.hour, s.minute).getTime() < now.getTime() - 60_000) return ["That send time has already passed."];
  if (s.mode === "repeat") {
    const first = firstRunAt(s, now);
    if (!first) return ["That repeat would never send: the end date has already passed."];
  }
  return [];
}
