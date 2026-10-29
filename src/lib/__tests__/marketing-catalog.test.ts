import { describe, expect, it } from "vitest";
import { buildCatalog } from "@/lib/marketing-catalog";
import {
  DEFAULT_FRIDAY_TIMES,
  FRIDAY_SCHEDULE_KEYS,
  formatClock,
  resolveFridayTimes,
  validateFridayTime,
  validateNudgeDelay,
} from "@/lib/friday-schedule";
import { FRIDAY_TEMPLATE_DEFAULTS } from "@/server/friday-template-defaults";
import { PARTNER_INVITE_TEMPLATE_DEFAULTS } from "@/server/partner-invite-template-defaults";
import { CLOSING_SURVEY_TEMPLATE_KEYS } from "@/lib/closing-survey";

const partner = { reminderDays: [2, 5, 9, 14], expiresDays: 21 };

describe("Friday send times", () => {
  it("default to the live schedule: 9:00, 11:00, 11:50, rebook 9:00, follow-up 3:00 PM, nudge after 3 days", () => {
    const t = resolveFridayTimes([]);
    expect(formatClock(t.morningReminder)).toBe("9:00 AM");
    expect(formatClock(t.hourBefore)).toBe("11:00 AM");
    expect(formatClock(t.tenMinutes)).toBe("11:50 AM");
    expect(formatClock(t.rollForward)).toBe("9:00 AM");
    expect(formatClock(t.followUp)).toBe("3:00 PM");
    expect(t.nudgeDelayDays).toBe(3);
  });

  it("apply saved overrides", () => {
    const t = resolveFridayTimes([
      { templateKey: FRIDAY_SCHEDULE_KEYS.hourBefore, sendHour: 10, sendMinute: 30, delayDays: null },
      { templateKey: FRIDAY_SCHEDULE_KEYS.nudge, sendHour: null, sendMinute: null, delayDays: 5 },
    ]);
    expect(formatClock(t.hourBefore)).toBe("10:30 AM");
    expect(t.nudgeDelayDays).toBe(5);
    expect(formatClock(t.tenMinutes)).toBe("11:50 AM");
  });

  it("ignore saved values that break the rules instead of trusting them", () => {
    const t = resolveFridayTimes([
      { templateKey: FRIDAY_SCHEDULE_KEYS.tenMinutes, sendHour: 12, sendMinute: 30, delayDays: null }, // after the start
      { templateKey: FRIDAY_SCHEDULE_KEYS.nudge, sendHour: null, sendMinute: null, delayDays: 99 },
    ]);
    expect(t.tenMinutes).toEqual(DEFAULT_FRIDAY_TIMES.tenMinutes);
    expect(t.nudgeDelayDays).toBe(3);
  });

  it("require reminders before noon and the follow-up after the session", () => {
    expect(validateFridayTime(FRIDAY_SCHEDULE_KEYS.hourBefore, 11, 59)).toBeNull();
    expect(validateFridayTime(FRIDAY_SCHEDULE_KEYS.hourBefore, 12, 0)).not.toBeNull();
    expect(validateFridayTime(FRIDAY_SCHEDULE_KEYS.followUp, 12, 30)).not.toBeNull();
    expect(validateFridayTime(FRIDAY_SCHEDULE_KEYS.followUp, 13, 0)).toBeNull();
    expect(validateFridayTime(FRIDAY_SCHEDULE_KEYS.rollForward, 5, 0)).not.toBeNull();
    expect(validateFridayTime(FRIDAY_SCHEDULE_KEYS.rollForward, 9, 15)).toBeNull();
    expect(validateFridayTime("friday_confirmation", 9, 0)).not.toBeNull();
    expect(validateFridayTime(FRIDAY_SCHEDULE_KEYS.hourBefore, 9, 75)).not.toBeNull();
  });

  it("limit the nudge wait to 1-10 whole days", () => {
    expect(validateNudgeDelay(1)).toBeNull();
    expect(validateNudgeDelay(10)).toBeNull();
    expect(validateNudgeDelay(0)).not.toBeNull();
    expect(validateNudgeDelay(11)).not.toBeNull();
    expect(validateNudgeDelay(2.5)).not.toBeNull();
  });
});

describe("Marketing email catalog", () => {
  const groups = buildCatalog(DEFAULT_FRIDAY_TIMES, partner);
  const all = groups.flatMap((g) => g.emails);

  it("lists each email once", () => {
    const keys = all.map((e) => e.templateKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("only points at templates that exist in code", () => {
    const known = new Set([
      ...FRIDAY_TEMPLATE_DEFAULTS.map((t) => t.key),
      ...PARTNER_INVITE_TEMPLATE_DEFAULTS.map((t) => t.key),
      ...CLOSING_SURVEY_TEMPLATE_KEYS,
    ]);
    for (const e of all) expect(known.has(e.templateKey), e.templateKey).toBe(true);
  });

  it("covers every Friday template", () => {
    const friday = groups.find((g) => g.id === "friday")!.emails.map((e) => e.templateKey);
    for (const t of FRIDAY_TEMPLATE_DEFAULTS) expect(friday).toContain(t.key);
  });

  it("describes the times in effect", () => {
    const friday = groups.find((g) => g.id === "friday")!.emails;
    expect(friday.find((e) => e.templateKey === FRIDAY_SCHEDULE_KEYS.hourBefore)!.when).toContain("11:00 AM ET");
    expect(friday.find((e) => e.templateKey === FRIDAY_SCHEDULE_KEYS.tenMinutes)!.when).toContain("11:50 AM ET");
  });

  it("shows a switch only where switching the email off really stops it", () => {
    const byKey = new Map(all.map((e) => [e.templateKey, e]));
    expect(byKey.get("friday_reminder_1h")!.canToggle).toBe(true);
    expect(byKey.get("partner_invite_initial")!.canToggle).toBe(false); // falls back to built-in wording when off
    expect(byKey.get("borrower_closed_congrats")!.canToggle).toBe(false);
  });

  it("maps partner reminders to the days on the schedule, and marks unused ones", () => {
    const two = buildCatalog(DEFAULT_FRIDAY_TIMES, { reminderDays: [3, 10], expiresDays: 21 }).find((g) => g.id === "partner")!.emails;
    expect(two.find((e) => e.templateKey === "partner_invite_reminder_first")!.when).toContain("Day 3");
    expect(two.find((e) => e.templateKey === "partner_invite_reminder_final")!.when).toContain("Day 10");
    expect(two.find((e) => e.templateKey === "partner_invite_reminder_third")!.when).toContain("Not used");
  });
});
