import { describe, expect, it } from "vitest";
import { currentEventFor, type KeyDateEvent } from "@/lib/key-date-tracker";

function ev(status: string, eventDay: number, loggedDay: number): KeyDateEvent {
  return {
    id: `${status}-${eventDay}-${loggedDay}`,
    item: "appraisal",
    status,
    eventDate: new Date(Date.UTC(2026, 9, eventDay)),
    createdAt: new Date(Date.UTC(2026, 9, loggedDay)),
    createdByName: null,
  };
}

describe("currentEventFor", () => {
  it("takes the furthest-along status", () => {
    expect(currentEventFor("appraisal", [ev("Ordered", 6, 6), ev("Scheduled", 9, 7)])?.status).toBe("Scheduled");
  });

  it("when a status was logged twice, the one logged last wins even with an earlier date (a backdate)", () => {
    const current = currentEventFor("appraisal", [ev("Ordered", 7, 7), ev("Ordered", 6, 8)]);
    expect(current?.eventDate.getUTCDate()).toBe(6);
  });
});
