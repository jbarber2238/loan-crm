import { describe, expect, it } from "vitest";
import { isInviteExpired, nextDueStep, parseReminderDays, reminderTemplateKey } from "@/lib/partner-invite-cadence";

const days = [2, 5, 9, 14];

describe("invite reminder schedule", () => {
  it("reads the days people type", () => {
    expect(parseReminderDays("2, 5, 9, 14")).toEqual([2, 5, 9, 14]);
    expect(parseReminderDays("14 2 5,5 9 abc 0 -3")).toEqual([2, 5, 9, 14]);
    expect(parseReminderDays("")).toEqual([]);
  });

  it("sends nothing before the first reminder day", () => {
    expect(nextDueStep(1.9, days, new Set(), 21).due).toBeNull();
  });

  it("sends each reminder on its day, once", () => {
    expect(nextDueStep(2, days, new Set(), 21)).toEqual({ due: 1, skipped: [] });
    expect(nextDueStep(2.5, days, new Set([1]), 21).due).toBeNull();
    expect(nextDueStep(5, days, new Set([1]), 21).due).toBe(2);
    expect(nextDueStep(14.2, days, new Set([1, 2, 3]), 21).due).toBe(4);
  });

  it("when the job missed days, sends only the latest overdue reminder", () => {
    expect(nextDueStep(10, days, new Set([1]), 21)).toEqual({ due: 3, skipped: [2] });
  });

  it("stops once the invite expires", () => {
    expect(nextDueStep(21, days, new Set([1, 2, 3]), 21).due).toBeNull();
    expect(isInviteExpired(20.9, 21)).toBe(false);
    expect(isInviteExpired(21, 21)).toBe(true);
  });

  it("uses the final template for the last step", () => {
    expect([1, 2, 3, 4].map((s) => reminderTemplateKey(s, 4))).toEqual([
      "partner_invite_reminder_first",
      "partner_invite_reminder_second",
      "partner_invite_reminder_third",
      "partner_invite_reminder_final",
    ]);
    expect(reminderTemplateKey(2, 2)).toBe("partner_invite_reminder_final");
  });
});
