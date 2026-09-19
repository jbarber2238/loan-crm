// The Dashboard's "metrics library" — every metric anyone has asked for,
// whether or not it's on the live dashboard today. Splitting the catalog out
// from dashboard-metrics.ts (which only computes the always-on numbers)
// keeps "what exists" separate from "what's turned on":
//
//   - computable: true  → fully built; either always shown, or shown only
//     once an admin flips it on via companySettings.enabledDashboardMetrics
//     (see `defaultEnabled`).
//   - computable: false → not yet buildable at all, because it needs a data
//     source this app doesn't collect yet (QuickBooks cost data, marketing
//     spend, rate-lock expiration dates, delinquency/servicing data). These
//     show on the dashboard's Metrics Library card as "needs: ..." so the
//     gap is visible without pretending the number exists.
//
// This file is intentionally just data — no queries here. The always-on
// computations live in dashboard-metrics.ts; the ones toggled through this
// library reuse the same building blocks once enabled.

export type DashboardSection =
  | "pipeline_conversion"
  | "loan_officer_performance"
  | "loan_quality_risk"
  | "lender_relationship_health"
  | "cost_profitability"
  | "operations"
  | "forward_looking";

export const DASHBOARD_SECTIONS: { value: DashboardSection; label: string }[] = [
  { value: "pipeline_conversion", label: "Pipeline & Conversion" },
  { value: "loan_officer_performance", label: "Loan Officer Performance" },
  { value: "loan_quality_risk", label: "Loan Quality & Risk" },
  { value: "lender_relationship_health", label: "Lender Relationship Health" },
  { value: "cost_profitability", label: "Cost & Profitability" },
  { value: "operations", label: "Operations" },
  { value: "forward_looking", label: "Forward Looking" },
];

export interface DashboardMetricDef {
  id: string;
  section: DashboardSection;
  label: string;
  description: string;
  computable: boolean;
  /** Only meaningful when computable is true. Always-on metrics (the bulk of
   * v1) aren't in this file at all — they just render unconditionally in
   * dashboard-metrics.ts/page.tsx. This flag is for metrics that ARE built
   * but Justin explicitly wants off by default (e.g. avg origination
   * points) until he asks to see them day to day. */
  defaultEnabled?: boolean;
  /** Only meaningful when computable is false — what has to exist first. */
  needs?: string;
}

export const DASHBOARD_METRIC_LIBRARY: DashboardMetricDef[] = [
  {
    id: "avg_origination_points_by_loan_type",
    section: "cost_profitability",
    label: "Average Origination Fee / Points by Loan Type",
    description: "Margin tracking by loan category, not just total revenue.",
    computable: true,
    defaultEnabled: false,
  },
  {
    id: "cost_per_funded_loan",
    section: "cost_profitability",
    label: "Cost per Funded Loan",
    description: "(Marketing + comp + ops cost) ÷ loans closed — true unit economics.",
    computable: false,
    needs: "QuickBooks integration for cost data",
  },
  {
    id: "marketing_lead_source_roi",
    section: "cost_profitability",
    label: "Marketing / Lead Source ROI",
    description: "Cost per lead and cost per funded loan by source (referral, paid, organic, etc.).",
    computable: false,
    needs: "a way to record marketing/ad spend by source and period",
  },
  {
    id: "rate_lock_expiration_tracking",
    section: "loan_quality_risk",
    label: "Rate Lock Expiration / Extension Tracking",
    description: "How many locks extend or expire, and the cost of extensions.",
    computable: false,
    needs: "a rate lock expiration date field on deals",
  },
  {
    id: "post_close_delinquency",
    section: "loan_quality_risk",
    label: "Post-Close Delinquency / Default Rate",
    description: "30/60/90-day delinquency on closed loans, if servicing visibility exists.",
    computable: false,
    needs: "loan servicing/performance data after close",
  },
  {
    id: "rate_lock_pipeline_exposure",
    section: "forward_looking",
    label: "Rate Lock Pipeline Exposure",
    description: "Total $ volume currently locked and expiring within X days.",
    computable: false,
    needs: "a rate lock expiration date field on deals",
  },
  {
    id: "lost_reasons_breakdown",
    section: "pipeline_conversion",
    label: "Lost Reasons Breakdown",
    description: "Structured reason codes (credit, DSCR ratio, appraisal, borrower withdrew, etc.) for lost/disqualified deals.",
    computable: false,
    needs: "a structured Lost Reason category field (today lostReason/disqualifiedReason are free text only)",
  },
];

export function libraryMetricsFor(section: DashboardSection): DashboardMetricDef[] {
  return DASHBOARD_METRIC_LIBRARY.filter((m) => m.section === section);
}
