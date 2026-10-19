// The Friday "See It, Send It, Get Paid" Zoom: one session a week, Fridays at
// 12:00 PM Eastern. Everything here is pure so the schedule rules are testable.

export const FRIDAY_TZ = "America/New_York";
export const SESSION_HOUR_ET = 12;
/** After this time on Friday a new signup rolls to next week's session. */
export const SIGNUP_CUTOFF_HOUR_ET = 11;
export const SESSION_MINUTES = 30;
export const MORNING_REMINDER_HOUR_ET = 9;
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
