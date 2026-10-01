import { describe, it, expect } from "vitest";
import { checkReminderDue, easternDayNumber } from "@/lib/reminder-schedule";

// All times below are given in UTC and chosen to land on known Eastern
// local times — EDT (UTC-4) is in effect for the September dates used here.
describe("checkReminderDue", () => {
  it("is not due the same day even if 24+ hours haven't passed, when sent early morning", () => {
    // Sent 2026-09-18 06:00 ET (10:00 UTC). "Now" is the same day at 11:00 ET
    // (15:00 UTC) — five hours later, well past 11:30 but still day zero.
    const baseline = new Date("2026-09-18T10:00:00.000Z");
    const now = new Date("2026-09-18T15:00:00.000Z");
    const result = checkReminderDue(baseline, now, 24);
    expect(result.due).toBe(false);
  });

  it("is not due later the same day even if sent in the evening (the original bug)", () => {
    // Sent 2026-09-18 18:00 ET (22:00 UTC). Checking again at 23:00 UTC
    // (19:00 ET) the same day should NOT fire — this is exactly the drift
    // bug being fixed (naive 24h-later math would also say "not yet", but
    // the old code would eventually fire at 6 PM every day going forward).
    const baseline = new Date("2026-09-18T22:00:00.000Z");
    const now = new Date("2026-09-18T23:00:00.000Z");
    expect(checkReminderDue(baseline, now, 24).due).toBe(false);
  });

  it("fires at 7:00 AM ET the next day, even though barely 13 hours have passed since a 6 PM send", () => {
    // Sent 2026-09-18 18:00 ET. Next day, 2026-09-19 07:00 ET (11:00 UTC).
    const baseline = new Date("2026-09-18T22:00:00.000Z"); // 6:00 PM ET
    const now = new Date("2026-09-19T11:00:00.000Z"); // 7:00 AM ET next day
    expect(checkReminderDue(baseline, now, 24).due).toBe(true);
  });

  it("does not fire before 7:00 AM ET the next day", () => {
    const baseline = new Date("2026-09-18T22:00:00.000Z"); // 6:00 PM ET
    const now = new Date("2026-09-19T10:59:00.000Z"); // 6:59 AM ET next day
    expect(checkReminderDue(baseline, now, 24).due).toBe(false);
  });

  it("still waits for 7:00 AM ET even if overdue by several days (a missed cron run)", () => {
    const baseline = new Date("2026-09-18T22:00:00.000Z"); // 6:00 PM ET
    // 4 days later, 3:00 AM ET — well overdue, but still before this day's 7 AM.
    const beforeSevenAm = new Date("2026-09-22T07:00:00.000Z");
    expect(checkReminderDue(baseline, beforeSevenAm, 24).due).toBe(false);
    const sevenAm = new Date("2026-09-22T11:00:00.000Z"); // 7:00 AM ET same day
    expect(checkReminderDue(baseline, sevenAm, 24).due).toBe(true);
  });

  it("every-2-days and weekly intervals wait the right number of days before the fixed time matters", () => {
    const baseline = new Date("2026-09-18T11:00:00.000Z"); // 7:00 AM ET day 0
    const oneDayLater7am = new Date("2026-09-19T11:00:00.000Z");
    const twoDaysLater7am = new Date("2026-09-20T11:00:00.000Z");
    const sevenDaysLater7am = new Date("2026-09-25T11:00:00.000Z");

    expect(checkReminderDue(baseline, oneDayLater7am, 48).due).toBe(false);
    expect(checkReminderDue(baseline, twoDaysLater7am, 48).due).toBe(true);

    expect(checkReminderDue(baseline, twoDaysLater7am, 168).due).toBe(false);
    expect(checkReminderDue(baseline, sevenDaysLater7am, 168).due).toBe(true);
  });

  it("easternDayNumber treats any two timestamps on the same Eastern calendar day as equal", () => {
    const midnight = new Date("2026-09-18T04:00:00.000Z"); // 12:00 AM ET
    const almostMidnight = new Date("2026-09-19T03:59:00.000Z"); // 11:59 PM ET same day
    expect(easternDayNumber(midnight)).toBe(easternDayNumber(almostMidnight));
  });
});
