import { describe, expect, it } from "vitest";
import { bucketOf, daysUntilNext, nextDueAt } from "@/lib/follow-up-schedule";
import { etToUtc } from "@/lib/friday-schedule";

describe("follow-up schedule", () => {
  it("smart cadence widens: 2, 7, 14, then monthly", () => {
    expect([0, 1, 2, 3, 4, 9].map((n) => daysUntilNext("smart", n))).toEqual([2, 7, 14, 30, 30, 30]);
  });
  it("fixed cadences don't change", () => {
    expect(daysUntilNext("weekly", 5)).toBe(7);
    expect(daysUntilNext("quarterly", 0)).toBe(90);
  });
  it("is due at 9 AM Eastern, counted in calendar days", () => {
    expect(nextDueAt("weekly", 0, etToUtc("2026-10-29", 15, 30))).toEqual(etToUtc("2026-11-05", 9, 0));
  });
  it("buckets by status and date", () => {
    const now = etToUtc("2026-10-29", 12, 0);
    expect(bucketOf({ status: "active", nextFollowUpAt: etToUtc("2026-10-29", 9, 0) }, now)).toBe("due");
    expect(bucketOf({ status: "active", nextFollowUpAt: etToUtc("2026-10-30", 9, 0) }, now)).toBe("upcoming");
    expect(bucketOf({ status: "stopped", nextFollowUpAt: null }, now)).toBe("stopped");
  });
});
