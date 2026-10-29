import { describe, expect, it } from "vitest";
import { describeSchedule, firstRunAt, nextRunAfter, parseSchedule, scheduleProblems, type CampaignSchedule } from "@/lib/campaign-schedule";
import { etToUtc } from "@/lib/friday-schedule";

const repeat = (over: Partial<Extract<CampaignSchedule, { mode: "repeat" }>> = {}): CampaignSchedule => ({
  mode: "repeat",
  every: "week",
  weekday: 5,
  dayOfMonth: 1,
  hour: 9,
  minute: 0,
  startDate: "2026-10-29",
  endDate: null,
  maxRuns: null,
  ...over,
});

// Thursday Oct 29 2026, 10:00 AM Eastern
const now = etToUtc("2026-10-29", 10, 0);

describe("firstRunAt", () => {
  it("fires right away for send-now and never for a draft", () => {
    expect(firstRunAt({ mode: "once", now: true }, now)).toEqual(now);
    expect(firstRunAt({ mode: "draft" }, now)).toBeNull();
  });
  it("uses the set time for a one-off", () => {
    expect(firstRunAt({ mode: "once", now: false, date: "2026-11-02", hour: 8, minute: 30 }, now)).toEqual(etToUtc("2026-11-02", 8, 30));
  });
  it("finds the next matching weekday", () => {
    expect(firstRunAt(repeat(), now)).toEqual(etToUtc("2026-10-30", 9, 0));
  });
  it("skips a weekday time that already passed today", () => {
    expect(firstRunAt(repeat({ weekday: 4, hour: 9 }), now)).toEqual(etToUtc("2026-11-05", 9, 0));
  });
  it("finds the next day of the month", () => {
    expect(firstRunAt(repeat({ every: "month", dayOfMonth: 5 }), now)).toEqual(etToUtc("2026-11-05", 9, 0));
    expect(firstRunAt(repeat({ every: "month", dayOfMonth: 29, hour: 12 }), now)).toEqual(etToUtc("2026-10-29", 12, 0));
  });
  it("is null when the end date is already behind", () => {
    expect(firstRunAt(repeat({ endDate: "2026-10-01", startDate: "2026-09-01" }), now)).toBeNull();
  });
});

describe("nextRunAfter", () => {
  it("steps a week, two weeks or a month", () => {
    const last = etToUtc("2026-10-30", 9, 0);
    expect(nextRunAfter(repeat(), last, 1)).toEqual(etToUtc("2026-11-06", 9, 0));
    expect(nextRunAfter(repeat({ every: "two_weeks" }), last, 1)).toEqual(etToUtc("2026-11-13", 9, 0));
    expect(nextRunAfter(repeat({ every: "month", dayOfMonth: 30 > 28 ? 28 : 30 }), last, 1)).toEqual(etToUtc("2026-11-28", 9, 0));
  });
  it("stops at the end date or the run limit, and after a one-off", () => {
    const last = etToUtc("2026-10-30", 9, 0);
    expect(nextRunAfter(repeat({ endDate: "2026-11-05" }), last, 1)).toBeNull();
    expect(nextRunAfter(repeat({ maxRuns: 3 }), last, 3)).toBeNull();
    expect(nextRunAfter(repeat({ maxRuns: 3 }), last, 2)).not.toBeNull();
    expect(nextRunAfter({ mode: "once", now: true }, last, 1)).toBeNull();
  });
});

describe("parseSchedule", () => {
  it("accepts good schedules and rejects broken ones", () => {
    expect(parseSchedule(repeat())).toEqual(repeat());
    expect(parseSchedule({ mode: "once", now: false, date: "bad", hour: 9, minute: 0 })).toBeNull();
    expect(parseSchedule({ mode: "repeat", every: "daily" })).toBeNull();
    expect(parseSchedule(null)).toBeNull();
  });
});

describe("describeSchedule and problems", () => {
  it("reads in plain English", () => {
    expect(describeSchedule(repeat())).toBe("Repeats every Friday at 9:00 AM ET, starting Thu, Oct 29");
    expect(describeSchedule({ mode: "once", now: true })).toBe("Sends right away");
  });
  it("flags a time already gone and a draft", () => {
    expect(scheduleProblems({ mode: "once", now: false, date: "2026-10-01", hour: 9, minute: 0 }, now)).toHaveLength(1);
    expect(scheduleProblems({ mode: "draft" }, now)).toHaveLength(1);
    expect(scheduleProblems({ mode: "once", now: true }, now)).toEqual([]);
  });
});
