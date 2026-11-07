import { describe, expect, it } from "vitest";
import { dashboardRangeForecastEnd } from "../dashboard-ranges";

describe("dashboardRangeForecastEnd", () => {
  const now = new Date(2026, 10, 7, 12, 0, 0); // Nov 7, 2026

  it("reaches the last day of the month, not 'now'", () => {
    const end = dashboardRangeForecastEnd("this_month", now);
    expect(end.getMonth()).toBe(10);
    expect(end.getDate()).toBe(30);
  });

  it("reaches the end of the quarter and the year", () => {
    expect(dashboardRangeForecastEnd("this_quarter", now).getMonth()).toBe(11);
    expect(dashboardRangeForecastEnd("this_quarter", now).getDate()).toBe(31);
    expect(dashboardRangeForecastEnd("this_year", now).getMonth()).toBe(11);
  });

  it("ends tonight for today, a week ahead for last 7 days, and has no bound for all time", () => {
    expect(dashboardRangeForecastEnd("today", now).getDate()).toBe(7);
    expect(dashboardRangeForecastEnd("last_7", now).getDate()).toBe(14);
    expect(dashboardRangeForecastEnd("all_time", now).getFullYear()).toBeGreaterThan(5000);
  });
});
