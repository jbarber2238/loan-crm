// When an unread team message earns one reminder. Kept apart from the database code so the rules are easy to test.

/** A message nobody has read after this long gets one reminder. */
export const REMIND_AFTER_MS = 10 * 60_000;
/** The reminder job runs every 5 minutes, so each unread message falls into exactly one 5-minute slot. */
export const REMIND_SLOT_MS = 5 * 60_000;

/** True when a message that has been unread since `unreadSince` is due its reminder at `now`. */
export function reminderDue(unreadSince: Date, now: Date): boolean {
  const age = now.getTime() - unreadSince.getTime();
  return age >= REMIND_AFTER_MS && age < REMIND_AFTER_MS + REMIND_SLOT_MS;
}

/** No reminders overnight: only between 7 AM and 9 PM Eastern, which is when the team is at work. */
export function withinReminderHours(now: Date): boolean {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(now));
  return hour >= 7 && hour < 21;
}
