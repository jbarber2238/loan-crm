import { describe, expect, it } from "vitest";
import { daysAwayPhrase, daysBetween, dscrClosingTooSoon, easternDateKey, isDscrCategory, submittedGapPhrase } from "../closing-timeline";

describe("DSCR closing timeline", () => {
  it("knows the DSCR categories", () => {
    expect(isDscrCategory("dscr_purchase")).toBe(true);
    expect(isDscrCategory("dscr_cash_out_refinance")).toBe(true);
    expect(isDscrCategory("dscr_rate_term_refinance")).toBe(true);
    expect(isDscrCategory("fix_and_flip")).toBe(false);
    expect(isDscrCategory(null)).toBe(false);
  });
  it("counts calendar days across month ends", () => {
    expect(daysBetween("2026-11-19", "2026-12-19")).toBe(30);
    expect(daysBetween("2026-11-19", "2026-11-19")).toBe(0);
    expect(daysBetween("2026-11-19", "2026-11-01")).toBe(-18);
  });
  it("flags a DSCR closing date under 30 days and nothing else", () => {
    expect(dscrClosingTooSoon("dscr_purchase", "2026-12-10", "2026-11-19")).toBe(21);
    expect(dscrClosingTooSoon("dscr_purchase", "2026-12-18", "2026-11-19")).toBe(29);
    expect(dscrClosingTooSoon("dscr_purchase", "2026-12-19", "2026-11-19")).toBeNull();
    expect(dscrClosingTooSoon("dscr_purchase", "2026-11-01", "2026-11-19")).toBe(-18);
    expect(dscrClosingTooSoon("dscr_purchase", "", "2026-11-19")).toBeNull();
    expect(dscrClosingTooSoon("dscr_purchase", null, "2026-11-19")).toBeNull();
    expect(dscrClosingTooSoon("fix_and_flip", "2026-11-25", "2026-11-19")).toBeNull();
  });
  it("words the distance plainly", () => {
    expect(daysAwayPhrase(12)).toBe("That date is 12 days from today.");
    expect(daysAwayPhrase(1)).toBe("That date is 1 day from today.");
    expect(daysAwayPhrase(0)).toBe("That date is today.");
    expect(daysAwayPhrase(-3)).toBe("That date has already passed.");
  });
  it("words the gap from submission for staff", () => {
    expect(submittedGapPhrase(12)).toBe("The closing date is only 12 days after this deal was submitted.");
    expect(submittedGapPhrase(1)).toBe("The closing date is only 1 day after this deal was submitted.");
    expect(submittedGapPhrase(0)).toBe("The closing date was the same day this deal was submitted.");
    expect(submittedGapPhrase(-2)).toBe("The closing date was already past when this deal was submitted.");
  });
  it("reads a submission time on the Eastern calendar", () => {
    expect(easternDateKey(new Date("2026-11-20T02:30:00Z"))).toBe("2026-11-19");
  });
});
