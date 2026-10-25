// Researched 2026-09-19 — see chat for sourcing detail. Deliberately not
// presented as precise: non-QM/DSCR-specific industry-association data
// mostly doesn't exist, so these are the best available reference points,
// each labeled with what it actually is (a real published series vs. a
// lender's own marketing claim).
export const INDUSTRY_BENCHMARKS = [
  {
    label: "Application → Close (conventional mortgages)",
    value: "~42–45 days",
    source: "ICE Mortgage Technology Origination Insight Report",
    note: "Conventional-mortgage proxy, not non-QM-specific — no dedicated non-QM/DSCR industry series exists.",
  },
  {
    label: "Application → Close (hard money / fix-and-flip / bridge)",
    value: "~7–10 days typical, some lenders as fast as 5 days",
    source: "Cross-lender marketing claims (Kiavi, Easy Street Capital, RCN Capital, Lima One)",
    note: "Self-reported best-case figures, not audited aggregate data.",
  },
  {
    label: "Broker submission → term sheet (DSCR/non-QM wholesale)",
    value: "Same-day to 24–48 hours, by lender",
    source: "Cross-lender marketing claims (LendSure, Ridge Street Capital, Legions Capital, Jaken Finance)",
    note: "Self-reported best-case turnaround, not an industry average.",
  },
];

