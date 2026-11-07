import { describe, expect, it } from "vitest";
import { closingDayOffset, closingWatchLabel, closingWatchStatus, startOfEtToday } from "../closing-watch";

// Nov 7, 2026, 3 PM Eastern.
const now = new Date("2026-11-07T20:00:00Z");
const day = (d: string) => new Date(`${d}T00:00:00.000Z`);

describe("closing watch", () => {
  it("counts whole days from today in Eastern time", () => {
    expect(closingDayOffset(day("2026-11-07"), now)).toBe(0);
    expect(closingDayOffset(day("2026-11-04"), now)).toBe(-3);
    expect(closingDayOffset(day("2026-11-10"), now)).toBe(3);
  });

  it("does not tip a deal into overdue at 8 PM Eastern the night before its date", () => {
    const lateEvening = new Date("2026-11-08T01:30:00Z"); // 8:30 PM ET on Nov 7, already Nov 8 in UTC
    expect(closingDayOffset(day("2026-11-07"), lateEvening)).toBe(0);
    expect(closingWatchStatus(day("2026-11-07"), lateEvening)?.status).toBe("soon");
  });

  it("flags overdue, due within 3 days, and no date; leaves later dates alone", () => {
    expect(closingWatchStatus(day("2026-11-06"), now)?.status).toBe("overdue");
    expect(closingWatchStatus(day("2026-11-10"), now)?.status).toBe("soon");
    expect(closingWatchStatus(day("2026-11-11"), now)).toBeNull();
    expect(closingWatchStatus(null, now)?.status).toBe("no_date");
  });

  it("reads naturally", () => {
    expect(closingWatchLabel("overdue", -1)).toBe("Past Estimated Closing Date");
    expect(closingWatchLabel("overdue", -9)).toBe("Past Estimated Closing Date");
    expect(closingWatchLabel("soon", 0)).toBe("Estimated Closing Date is today");
    expect(closingWatchLabel("soon", 1)).toBe("1 day from Estimated Closing Date");
    expect(closingWatchLabel("soon", 3)).toBe("3 days from Estimated Closing Date");
    expect(closingWatchLabel("no_date", null)).toBe("No Estimated Closing Date");
  });

  it("starts today at midnight UTC of the Eastern calendar day", () => {
    expect(startOfEtToday(now).toISOString()).toBe("2026-11-07T00:00:00.000Z");
  });
});
