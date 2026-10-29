// Reminder timing for the Follow Up Assistant. Pure. A reminder is due at 9:00 AM Eastern on its day.

import { addDays, etDay, etToUtc } from "@/lib/friday-schedule";

export const FOLLOW_UP_HOUR_ET = 9;

export type FollowUpCadence = "smart" | "weekly" | "biweekly" | "monthly" | "quarterly";

export const CADENCES: { value: FollowUpCadence; label: string; description: string }[] = [
  { value: "smart", label: "Smart schedule", description: "2 days, then 1 week, 2 weeks, then every month" },
  { value: "weekly", label: "Every week", description: "Once a week" },
  { value: "biweekly", label: "Every 2 weeks", description: "Every other week" },
  { value: "monthly", label: "Every month", description: "About every 30 days" },
  { value: "quarterly", label: "Every 3 months", description: "About every 90 days" },
];

const SMART_DAYS = [2, 7, 14, 30];

export function isCadence(v: string): v is FollowUpCadence {
  return CADENCES.some((c) => c.value === v);
}

/** Days until the next reminder, given how many follow-ups have already happened. */
export function daysUntilNext(cadence: FollowUpCadence, touchesDone: number): number {
  switch (cadence) {
    case "weekly":
      return 7;
    case "biweekly":
      return 14;
    case "monthly":
      return 30;
    case "quarterly":
      return 90;
    default:
      return SMART_DAYS[Math.min(touchesDone, SMART_DAYS.length - 1)];
  }
}

/** The moment the next reminder is due, counted from `from`. */
export function nextDueAt(cadence: FollowUpCadence, touchesDone: number, from: Date): Date {
  return etToUtc(addDays(etDay(from), daysUntilNext(cadence, touchesDone)), FOLLOW_UP_HOUR_ET);
}

/** A reminder on a chosen day. */
export function dueOnDay(day: string): Date {
  return etToUtc(day, FOLLOW_UP_HOUR_ET);
}

export type FollowUpBucket = "due" | "upcoming" | "stopped";

export function bucketOf(c: { status: string; nextFollowUpAt: Date | null }, now: Date): FollowUpBucket {
  if (c.status !== "active") return "stopped";
  return c.nextFollowUpAt && c.nextFollowUpAt.getTime() <= now.getTime() ? "due" : "upcoming";
}
