import { describe, expect, it } from "vitest";
import { easternToday, isSameDayFundingByTiming } from "@/lib/same-day-funding";

// 2026-10-16 is during daylight time: Eastern = UTC-4.
const at = (isoUtc: string) => new Date(isoUtc);

describe("isSameDayFundingByTiming", () => {
  it("is same-day when closing today (Eastern)", () => {
    expect(isSameDayFundingByTiming("2026-10-16", at("2026-10-16T14:00:00Z"))).toBe(true); // 10:00 AM ET
  });

  it("is same-day for tomorrow's closing once it's 4:00 PM Eastern or later", () => {
    expect(isSameDayFundingByTiming("2026-10-17", at("2026-10-16T20:00:00Z"))).toBe(true); // 4:00 PM ET
    expect(isSameDayFundingByTiming("2026-10-17", at("2026-10-16T23:30:00Z"))).toBe(true); // 7:30 PM ET
  });

  it("is not same-day for tomorrow's closing before 4:00 PM Eastern", () => {
    expect(isSameDayFundingByTiming("2026-10-17", at("2026-10-16T19:59:00Z"))).toBe(false); // 3:59 PM ET
  });

  it("is not same-day for closings two or more days out", () => {
    expect(isSameDayFundingByTiming("2026-10-18", at("2026-10-16T23:30:00Z"))).toBe(false);
  });

  it("uses Eastern time for 'today', not UTC", () => {
    // 11:30 PM ET on the 16th is already the 17th in UTC.
    const lateEvening = at("2026-10-17T03:30:00Z");
    expect(easternToday(lateEvening)).toBe("2026-10-16");
    expect(isSameDayFundingByTiming("2026-10-16", lateEvening)).toBe(true);
    expect(isSameDayFundingByTiming("2026-10-17", lateEvening)).toBe(true);
  });
});
