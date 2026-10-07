import { describe, expect, it } from "vitest";
import { buildBorrowerKeyDates } from "@/lib/borrower-key-dates";
import { hasReachedStage } from "@/lib/deal-pipeline";
import type { KeyDateEvent } from "@/lib/key-date-tracker";

function event(item: KeyDateEvent["item"], status: string, day: number): KeyDateEvent {
  const eventDate = new Date(Date.UTC(2026, 9, day));
  return { id: `${item}-${status}`, item, status, eventDate, createdAt: eventDate, createdByName: null };
}

describe("buildBorrowerKeyDates", () => {
  it("shows every item as not ordered when nothing is logged", () => {
    const rows = buildBorrowerKeyDates([], null);
    expect(rows.map((r) => r.label)).toEqual(["Appraisal", "Property insurance", "Title", "Credit pull"]);
    expect(rows.every((r) => r.status === null && r.date === null)).toBe(true);
  });

  it("shows each item's furthest-along phase and its date", () => {
    const rows = buildBorrowerKeyDates(
      [event("appraisal", "Ordered", 2), event("appraisal", "Scheduled", 6), event("title", "Ordered", 5)],
      new Date(Date.UTC(2026, 9, 3))
    );
    expect(rows[0]).toMatchObject({ label: "Appraisal", status: "Scheduled" });
    expect(rows[0].date?.getUTCDate()).toBe(6);
    expect(rows[1].status).toBeNull();
    expect(rows[2]).toMatchObject({ label: "Title", status: "Ordered" });
    expect(rows[3]).toMatchObject({ label: "Credit pull", status: "Pulled" });
  });
});

describe("hasReachedStage", () => {
  it("is false before Initial App Review and true from it onward", () => {
    expect(hasReachedStage("negotiation", "initial_app_review")).toBe(false);
    expect(hasReachedStage("application", "initial_app_review")).toBe(false);
    expect(hasReachedStage("initial_app_review", "initial_app_review")).toBe(true);
    expect(hasReachedStage("underwriting_review", "initial_app_review")).toBe(true);
    expect(hasReachedStage("closed", "initial_app_review")).toBe(true);
  });

  it("is false for stages off the line", () => {
    expect(hasReachedStage("lost", "initial_app_review")).toBe(false);
  });
});
