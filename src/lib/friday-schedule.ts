// The Friday "See It, Send It, Get Paid" Zoom: one session a week, Fridays at
// 12:00 PM Eastern. Everything here is pure so the schedule rules are testable.

export const FRIDAY_TZ = "America/New_York";
export const SESSION_HOUR_ET = 12;
/** After this time on Friday a new signup rolls to next week's session. */
export const SIGNUP_CUTOFF_HOUR_ET = 11;
export const SESSION_MINUTES = 30;
export const MORNING_REMINDER_HOUR_ET = 9;
/** "We go live in 1 hour": 11:00 AM ET. */
export const HOUR_BEFORE_REMINDER_ET = { hour: 11, minute: 0 };
/** "Starting in 10 minutes": 11:50 AM ET. */
export const FINAL_REMINDER_ET = { hour: 11, minute: 50 };
export const HEADCOUNT_HOUR_ET = 8;
export const FOLLOWUP_HOUR_ET = 15;
export const ROLL_FORWARD_HOUR_ET = 9;
/** Time in the meeting that counts as "attended" rather than a click-in. */
export const ATTENDED_MIN_SECONDS = 5 * 60;

interface EtParts {
  y: number;
  m: number;
  d: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday ... 5 = Friday
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function etParts(date: Date): EtParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: FRIDAY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: WEEKDAYS.indexOf(get("weekday")),
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** The calendar day in Eastern, as YYYY-MM-DD. */
export function etDay(date: Date): string {
  const p = etParts(date);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function weekdayOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** The instant a given Eastern wall-clock time happens, DST-safe. */
export function etToUtc(day: string, hour: number, minute = 0): Date {
  const [y, m, d] = day.split("-").map(Number);
  for (const offset of [4, 5]) {
    const candidate = new Date(Date.UTC(y, m - 1, d, hour + offset, minute));
    const p = etParts(candidate);
    if (p.hour === hour && p.minute === minute && p.d === d) return candidate;
  }
  return new Date(Date.UTC(y, m - 1, d, hour + 5, minute));
}

/** The next session a new signup is booked into: this Friday until 11:00 AM ET, then the following Friday. */
export function nextSessionDay(now: Date): string {
  const p = etParts(now);
  const today = etDay(now);
  if (p.weekday === 5) return p.hour < SIGNUP_CUTOFF_HOUR_ET ? today : addDays(today, 7);
  const ahead = (5 - p.weekday + 7) % 7;
  return addDays(today, ahead);
}

export function sessionStart(day: string): Date {
  return etToUtc(day, SESSION_HOUR_ET);
}

export function sessionEnd(day: string): Date {
  return new Date(sessionStart(day).getTime() + SESSION_MINUTES * 60 * 1000);
}

/** "Friday, October 23 at 12:00 PM ET" */
export function formatSession(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const text = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d))
  );
  return `${text} at 12:00 PM ET`;
}

/** The most recent Friday session day whose time is `afterMinutes` or more behind `now` (null if the last one is older than `maxDaysBack`). */
export function latestSessionDayBefore(now: Date, afterMinutes: number, maxDaysBack = 3): string | null {
  const today = etDay(now);
  for (let i = 0; i <= maxDaysBack; i++) {
    const day = addDays(today, -i);
    if (weekdayOf(day) !== 5) continue;
    return now.getTime() >= sessionStart(day).getTime() + afterMinutes * 60 * 1000 ? day : null;
  }
  return null;
}

/** True once it is `hour`:00 Eastern on `day` or any later moment. */
export function isAtOrAfterEt(now: Date, day: string, hour: number): boolean {
  return now.getTime() >= etToUtc(day, hour).getTime();
}

// ---- editable send times -----------------------------------------------------

export interface ClockTime {
  hour: number;
  minute: number;
}

/** When each timed Friday email goes out (Eastern). Saved overrides live in the email_schedules table. */
export interface FridayTimes {
  morningReminder: ClockTime;
  hourBefore: ClockTime;
  tenMinutes: ClockTime;
  /** The Saturday rebook for no-shows, on the day after the session. */
  rollForward: ClockTime;
  /** The "thanks for joining" email, after the session. */
  followUp: ClockTime;
  /** Days after the follow-up before the one nudge. */
  nudgeDelayDays: number;
}

export const DEFAULT_FRIDAY_TIMES: FridayTimes = {
  morningReminder: { hour: MORNING_REMINDER_HOUR_ET, minute: 0 },
  hourBefore: HOUR_BEFORE_REMINDER_ET,
  tenMinutes: FINAL_REMINDER_ET,
  rollForward: { hour: ROLL_FORWARD_HOUR_ET, minute: 0 },
  followUp: { hour: FOLLOWUP_HOUR_ET, minute: 0 },
  nudgeDelayDays: 3,
};

/** The saved-override key for each timed email. */
export const FRIDAY_SCHEDULE_KEYS = {
  morningReminder: "friday_morning_reminder",
  hourBefore: "friday_reminder_1h",
  tenMinutes: "friday_reminder_10m",
  rollForward: "friday_rollforward",
  followUp: "friday_followup",
  nudge: "friday_nudge",
} as const;

export interface ScheduleOverride {
  templateKey: string;
  sendHour: number | null;
  sendMinute: number | null;
  delayDays: number | null;
}

/** The defaults with any saved overrides applied. Bad saved values are ignored rather than trusted. */
export function resolveFridayTimes(overrides: ScheduleOverride[]): FridayTimes {
  const times: FridayTimes = {
    morningReminder: { ...DEFAULT_FRIDAY_TIMES.morningReminder },
    hourBefore: { ...DEFAULT_FRIDAY_TIMES.hourBefore },
    tenMinutes: { ...DEFAULT_FRIDAY_TIMES.tenMinutes },
    rollForward: { ...DEFAULT_FRIDAY_TIMES.rollForward },
    followUp: { ...DEFAULT_FRIDAY_TIMES.followUp },
    nudgeDelayDays: DEFAULT_FRIDAY_TIMES.nudgeDelayDays,
  };
  const clocks: [string, ClockTime][] = [
    [FRIDAY_SCHEDULE_KEYS.morningReminder, times.morningReminder],
    [FRIDAY_SCHEDULE_KEYS.hourBefore, times.hourBefore],
    [FRIDAY_SCHEDULE_KEYS.tenMinutes, times.tenMinutes],
    [FRIDAY_SCHEDULE_KEYS.rollForward, times.rollForward],
    [FRIDAY_SCHEDULE_KEYS.followUp, times.followUp],
  ];
  for (const o of overrides) {
    const clock = clocks.find(([key]) => key === o.templateKey)?.[1];
    if (clock && o.sendHour !== null && o.sendMinute !== null && validateFridayTime(o.templateKey, o.sendHour, o.sendMinute) === null) {
      clock.hour = o.sendHour;
      clock.minute = o.sendMinute;
    }
    if (o.templateKey === FRIDAY_SCHEDULE_KEYS.nudge && o.delayDays !== null && validateNudgeDelay(o.delayDays) === null) times.nudgeDelayDays = o.delayDays;
  }
  return times;
}

/** Why a send time can't be used, or null when it's fine. Reminders must come before the noon start; the follow-up after attendance is known. */
export function validateFridayTime(key: string, hour: number, minute: number): string | null {
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return "Pick a real time.";
  const minutes = hour * 60 + minute;
  switch (key) {
    case FRIDAY_SCHEDULE_KEYS.morningReminder:
    case FRIDAY_SCHEDULE_KEYS.hourBefore:
    case FRIDAY_SCHEDULE_KEYS.tenMinutes:
      return minutes < SESSION_HOUR_ET * 60 ? null : "Reminders have to go out before the 12:00 PM start.";
    case FRIDAY_SCHEDULE_KEYS.followUp:
      // Attendance is pulled from Zoom 45 minutes after the start; the follow-up goes to people marked attended.
      return minutes >= SESSION_HOUR_ET * 60 + 60 ? null : "The follow-up goes after the session, 1:00 PM or later.";
    case FRIDAY_SCHEDULE_KEYS.rollForward:
      return hour >= 6 && hour <= 20 ? null : "Pick a time between 6:00 AM and 8:59 PM.";
    default:
      return "That email doesn't have a send time.";
  }
}

export function validateNudgeDelay(days: number): string | null {
  return Number.isInteger(days) && days >= 1 && days <= 10 ? null : "Enter a whole number of days from 1 to 10.";
}

/** "9:00 AM" */
export function formatClock({ hour, minute }: ClockTime): string {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:${pad(minute)} ${hour < 12 ? "AM" : "PM"}`;
}

/** True once it is `hour`:`minute` Eastern on `day` or any later moment. */
export function isAtOrAfterEtTime(now: Date, day: string, time: { hour: number; minute: number }): boolean {
  return now.getTime() >= etToUtc(day, time.hour, time.minute).getTime();
}

// ---- calendar entries --------------------------------------------------------

const icsStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function googleCalendarUrl(day: string, joinUrl: string): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: "See It, Send It, Get Paid — Manna Lending",
    dates: `${icsStamp(sessionStart(day))}/${icsStamp(sessionEnd(day))}`,
    details: `A 30-minute lunch Zoom on spotting fundable investor deals and getting paid for the introduction.\n\nJoin: ${joinUrl}`,
    location: joinUrl,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function buildIcs({ uid, day, joinUrl }: { uid: string; day: string; joinUrl: string }): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Manna Lending//Friday Zoom//EN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}@mannalendingco.com`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(sessionStart(day))}`,
    `DTEND:${icsStamp(sessionEnd(day))}`,
    "SUMMARY:See It\\, Send It\\, Get Paid — Manna Lending",
    "DESCRIPTION:A 30-minute lunch Zoom on spotting fundable investor deals and getting paid for the introduction.",
    `LOCATION:${joinUrl}`,
    `URL:${joinUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}
