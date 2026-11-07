// Every dashboard metric filters by when a deal ENTERED the relevant stage
// (dealStageHistory.changedAt), not deals.createdAt — so "applications this
// month" counts deals that reached Application in the window regardless of
// when the deal itself first came in. See dashboard-metrics.ts.

export const DASHBOARD_RANGES = [
  { value: "today", label: "Today" },
  { value: "last_7", label: "Last 7 Days" },
  { value: "this_month", label: "This Month" },
  { value: "this_quarter", label: "This Quarter" },
  { value: "this_year", label: "This Year" },
  { value: "all_time", label: "All Time" },
] as const;

export type DashboardRange = (typeof DASHBOARD_RANGES)[number]["value"];

export const DEFAULT_DASHBOARD_RANGE: DashboardRange = "this_month";

export function isDashboardRange(value: string): value is DashboardRange {
  return DASHBOARD_RANGES.some((r) => r.value === value);
}

/** Inclusive start of the range, or null for "all_time" (no lower bound). */
export function dashboardRangeStart(range: DashboardRange, now: Date = new Date()): Date | null {
  switch (range) {
    case "today":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case "last_7":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "this_month":
      return new Date(now.getFullYear(), now.getMonth(), 1);
    case "this_quarter": {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      return new Date(now.getFullYear(), quarterStartMonth, 1);
    }
    case "this_year":
      return new Date(now.getFullYear(), 0, 1);
    case "all_time":
      return null;
  }
}

/**
 * Where a FORECAST for this range stops. Everything else on the dashboard looks
 * back and ends "now", but a forecast looks forward: "this month" should reach
 * the last day of the month, so open deals expected to close later this month
 * count. Today ends tonight, a week-range looks a week ahead, and all-time has
 * no upper bound.
 */
export function dashboardRangeForecastEnd(range: DashboardRange, now: Date = new Date()): Date {
  switch (range) {
    case "today":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    case "last_7":
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case "this_month":
      return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    case "this_quarter": {
      const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
      return new Date(now.getFullYear(), quarterStartMonth + 3, 0, 23, 59, 59, 999);
    }
    case "this_year":
      return new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    case "all_time":
      return new Date(8.64e15);
  }
}
