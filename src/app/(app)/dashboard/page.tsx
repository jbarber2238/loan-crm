import Link from "next/link";
import { requireAdmin } from "@/server/auth/guards";
import { buildDashboardData } from "@/server/dashboard-metrics";
import { DASHBOARD_RANGES, DEFAULT_DASHBOARD_RANGE, isDashboardRange } from "@/lib/dashboard-ranges";
import { STAGES, LOAN_CATEGORIES, labelFor } from "@/lib/labels";
import { PIPELINE_STAGES } from "@/lib/deal-pipeline";
import { InlineBar } from "@/components/dashboard/inline-bar";
import { StageBarChart } from "@/components/dashboard/stage-bar-chart";
import { MetricsLibrarySheet } from "@/components/dashboard/metrics-library-sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function stageLabel(stage: string): string {
  return labelFor(STAGES, stage);
}

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function pct(n: number | null, digits = 0): string {
  if (n === null) return "—";
  return `${n.toFixed(digits)}%`;
}

function days(n: number | null): string {
  if (n === null) return "—";
  return `${n.toFixed(0)}d`;
}

// Below a day, showing "0d" hides the number that actually matters — New →
// Rate Shopping should basically always read in hours, not round to zero.
function daysAndHours(n: number | null): string {
  if (n === null) return "—";
  const totalHours = n * 24;
  if (n < 1) return `${Math.round(totalHours)}h`;
  const wholeDays = Math.floor(n);
  const remHours = Math.round((n - wholeDays) * 24);
  return remHours > 0 ? `${wholeDays}d ${remHours}h` : `${wholeDays}d`;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="pt-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

// Researched 2026-09-19 — see chat for sourcing detail. Deliberately not
// presented as precise: non-QM/DSCR-specific industry-association data
// mostly doesn't exist, so these are the best available reference points,
// each labeled with what it actually is (a real published series vs. a
// lender's own marketing claim).
const INDUSTRY_BENCHMARKS = [
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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const range =
    typeof params.range === "string" && isDashboardRange(params.range) ? params.range : DEFAULT_DASHBOARD_RANGE;

  const data = await buildDashboardData(range);
  const enabled = new Set(data.enabledDashboardMetrics);

  const lostDisqualifiedEntered = data.pipelineConversion.funnel
    .filter((r) => r.stage === "lost" || r.stage === "disqualified")
    .reduce((sum, r) => sum + r.enteredCount, 0);
  const funnelByStage = new Map(data.pipelineConversion.funnel.map((r) => [r.stage, r.enteredCount]));
  const linearFunnelData = [
    ...PIPELINE_STAGES.filter((s) => s.value !== "closed").map((s) => ({
      label: s.label,
      count: funnelByStage.get(s.value) ?? 0,
    })),
    { label: "Lost / Disqualified", count: lostDisqualifiedEntered },
  ];

  return (
    <div className="space-y-10 pb-16">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-md border p-1">
            {DASHBOARD_RANGES.map((r) => (
              <Link
                key={r.value}
                href={`/dashboard?range=${r.value}`}
                className={cn(
                  "rounded px-2.5 py-1 text-sm",
                  r.value === range ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {r.label}
              </Link>
            ))}
          </div>
          <MetricsLibrarySheet enabledMetrics={data.enabledDashboardMetrics} />
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-4">
        <SectionHeading
          title="Pipeline & Conversion"
          subtitle="Today is midnight-to-midnight. Total Pipeline Value and Total Lost Value are real-time snapshots — a restored deal drops out immediately, not just on its next stage change."
        />

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard
            label="New Leads"
            value={String(data.pipelineConversion.newLeads)}
            sub="original submissions only, not restores"
          />
          <StatCard label="Restored Leads" value={String(data.pipelineConversion.restoredLeads)} sub="old deals back in New/Rate Shopping" />
          <StatCard
            label="Applications Submitted"
            value={String(data.pipelineConversion.applicationsSubmitted)}
            sub={`${data.pipelineConversion.applicationsSubmittedDirect} direct · ${data.pipelineConversion.applicationsSubmittedRestored} restored`}
          />
          <StatCard label="Leads → Applications" value={pct(data.pipelineConversion.leadToApplicationPct)} sub="of this period's New Leads" />
          <StatCard label="Leads Lost" value={pct(data.pipelineConversion.leadLostPct)} sub="of this period's New Leads" />
          <StatCard label="Total Pipeline Value" value={money(data.pipelineConversion.totalPipelineValue)} sub="live, as of now" />
          <StatCard label="Total Lost Value" value={money(data.pipelineConversion.totalLostValue)} sub="currently sitting in Lost" />
          <StatCard
            label="Loans Closed"
            value={String(data.pipelineConversion.loansClosed)}
            sub={money(data.pipelineConversion.totalVolumeClosed) + " total volume"}
          />
          <StatCard label="Average Loan Size (Requested)" value={money(data.pipelineConversion.averageLoanSizeRequested)} sub="this period's New Leads" />
          <StatCard label="Average Closed Loan Size" value={money(data.pipelineConversion.averageLoanSizeClosed)} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline Funnel</CardTitle>
            <p className="text-xs text-muted-foreground">
              Deals that entered each core stage this period, in order, plus everything Lost or Disqualified.
            </p>
          </CardHeader>
          <CardContent>
            <StageBarChart data={linearFunnelData} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Stage-to-Stage Timing</CardTitle>
              <p className="text-xs text-muted-foreground">Days and hours between key early stages.</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.pipelineConversion.stageTransitionTimes.map((row) => (
                <div key={row.label} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{row.label}</span>
                  <span className="text-muted-foreground">
                    {daysAndHours(row.avgDays)} avg {row.count > 0 && `· ${row.count} deals`}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Speed to Close, by Loan Type</CardTitle>
              <p className="text-xs text-muted-foreground">Lead → close, and application → close.</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.pipelineConversion.speedLeadToClose.length === 0 && (
                  <p className="text-sm text-muted-foreground">No closed deals in this range.</p>
                )}
                {data.pipelineConversion.speedLeadToClose.map((row) => {
                  const appToClose = data.pipelineConversion.speedApplicationToClose.find(
                    (r) => r.loanCategory === row.loanCategory
                  );
                  return (
                    <div key={row.loanCategory} className="flex items-center justify-between text-sm">
                      <span className="font-medium">{labelFor(LOAN_CATEGORIES, row.loanCategory)}</span>
                      <span className="text-muted-foreground text-right">
                        {row.averageDays.toFixed(0)}d lead→close
                        {appToClose && ` · ${appToClose.averageDays.toFixed(0)}d app→close`}
                        {" · "}
                        {row.closedCount} closed
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-4">
        <SectionHeading title="Cost & Profitability" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-2">
          <StatCard
            label="Projected Revenue"
            value={money(data.costProfitability.projectedRevenue)}
            sub="open deals expected to close in this period"
          />
          <StatCard label="Closed Revenue" value={money(data.costProfitability.closedRevenue)} />
        </div>
        {enabled.has("avg_origination_points_by_loan_type") && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Average Origination Points, by Loan Type</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.costProfitability.avgOriginationPointsByLoanType.length === 0 && (
                <p className="text-sm text-muted-foreground">No data in this range.</p>
              )}
              {data.costProfitability.avgOriginationPointsByLoanType.map((row) => (
                <div key={row.loanCategory} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{labelFor(LOAN_CATEGORIES, row.loanCategory)}</span>
                  <span className="text-muted-foreground">
                    {row.averagePoints.toFixed(2)} pts · {row.count} closed
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-4">
        <SectionHeading title="Loan Officer Performance" />
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="grid grid-cols-7 gap-2 text-xs font-medium text-muted-foreground">
                <span className="col-span-2">Loan Officer</span>
                <span className="text-right">Closed</span>
                <span className="text-right">Volume</span>
                <span className="text-right">Revenue</span>
                <span className="text-right">Avg Deal</span>
                <span className="text-right">Lead→App / App→Close</span>
              </div>
              {data.loanOfficerPerformance.length === 0 && (
                <p className="text-sm text-muted-foreground">No data in this range.</p>
              )}
              {data.loanOfficerPerformance.map((row) => (
                <div key={row.userId} className="grid grid-cols-7 gap-2 text-sm items-center">
                  <span className="col-span-2 truncate font-medium">{row.name}</span>
                  <span className="text-right">{row.closedCount || "—"}</span>
                  <span className="text-right">{money(row.closedVolume)}</span>
                  <span className="text-right">{money(row.revenue)}</span>
                  <span className="text-right">{row.averageDealSize ? money(row.averageDealSize) : "—"}</span>
                  <span className="text-right text-xs text-muted-foreground">
                    {pct(row.leadToApplicationPct)} / {pct(row.applicationToClosePct)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-4">
        <SectionHeading
          title="Loan Quality & Risk"
          subtitle="Closed loans only, within the selected range."
        />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Average LTV at Closing" value={pct(data.loanQuality.averageLtvAtClosing, 1)} />
          <StatCard
            label="Average DSCR Ratio"
            value={data.loanQuality.averageDscrAtClosing !== null ? data.loanQuality.averageDscrAtClosing.toFixed(2) : "—"}
            sub="DSCR/Portfolio closed loans"
          />
          <StatCard
            label="Average FICO"
            value={data.loanQuality.averageEstimatedFicoClosed !== null ? Math.round(data.loanQuality.averageEstimatedFicoClosed).toString() : "—"}
            sub="borrower-estimated at intake, not pulled credit"
          />
          <StatCard
            label="Appraisal Accuracy"
            value={pct(data.loanQuality.appraisalAccuracy.pctBelowExpected)}
            sub={
              data.loanQuality.appraisalAccuracy.sampleSize
                ? `came in below expected, avg ${pct(data.loanQuality.appraisalAccuracy.averagePctUnder, 1)} under (n=${data.loanQuality.appraisalAccuracy.sampleSize})`
                : "no appraisal data in range"
            }
          />
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-4">
        <SectionHeading title="Lender Relationship Health" />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Application-Stage Losses by Lender</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.lenderLoss.length === 0 && <p className="text-sm text-muted-foreground">No data in this range.</p>}
              {data.lenderLoss.map((row) => (
                <div key={row.lenderId} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{row.lenderName}</span>
                    <span className="text-muted-foreground">
                      {row.lostOrDisqualified} / {row.reachedApplication} ({pct((row.lostOrDisqualified / row.reachedApplication) * 100)})
                    </span>
                  </div>
                  <InlineBar percent={(row.lostOrDisqualified / row.reachedApplication) * 100} />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Wallet Share by Lender</CardTitle>
              <p className="text-xs text-muted-foreground">% of closed volume — watch for over-concentration.</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.walletShare.length === 0 && <p className="text-sm text-muted-foreground">No closed deals in this range.</p>}
              {data.walletShare.map((row) => (
                <div key={row.lenderId} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{row.lenderName}</span>
                    <span className="text-muted-foreground">
                      {money(row.volume)} ({pct(row.pct)})
                    </span>
                  </div>
                  <InlineBar percent={row.pct} />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lender Performance</CardTitle>
            <p className="text-xs text-muted-foreground">Priced with, chosen, closed, lost, and average time to close once chosen.</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="grid grid-cols-6 gap-2 text-xs font-medium text-muted-foreground">
                <span className="col-span-2">Lender</span>
                <span className="text-right">Priced</span>
                <span className="text-right">Chosen</span>
                <span className="text-right">Closed</span>
                <span className="text-right">Lost</span>
              </div>
              {data.lenderPerformance.length === 0 && <p className="text-sm text-muted-foreground">No data in this range.</p>}
              {data.lenderPerformance.map((row) => (
                <div key={row.lenderId} className="grid grid-cols-6 gap-2 text-sm items-center">
                  <span className="col-span-2 truncate font-medium">
                    {row.lenderName}
                    {row.averageDaysToClose !== null && (
                      <span className="ml-1 text-xs text-muted-foreground">({days(row.averageDaysToClose)} avg to close)</span>
                    )}
                  </span>
                  <span className="text-right">{row.priced || "—"}</span>
                  <span className="text-right">{row.chosen || "—"}</span>
                  <span className="text-right">{row.closed || "—"}</span>
                  <span className="text-right">{row.lost || "—"}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lender Turn Times</CardTitle>
            <p className="text-xs text-muted-foreground">
              Approximated from our own button clicks (no lender-reply timestamp exists): Price Loan → term sheet
              drafted, and Application → Closed.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2 text-xs font-medium text-muted-foreground">
                <span>Lender</span>
                <span className="text-right">Time to Term Sheet</span>
                <span className="text-right">Time to Close</span>
              </div>
              {data.lenderTurnTimes.length === 0 && <p className="text-sm text-muted-foreground">No data in this range.</p>}
              {data.lenderTurnTimes.map((row) => (
                <div key={row.lenderId} className="grid grid-cols-3 gap-2 text-sm">
                  <span className="truncate font-medium">{row.lenderName}</span>
                  <span className="text-right">{daysAndHours(row.averageDaysToTermSheet)}</span>
                  <span className="text-right">{days(row.averageDaysToClose)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Referral Partner Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-2 text-xs font-medium text-muted-foreground">
                <span>Partner</span>
                <span className="text-right">Referrals</span>
                <span className="text-right">Closed</span>
                <span className="text-right">Fees Paid / Pending</span>
              </div>
              {data.referralPerformance.length === 0 && (
                <p className="text-sm text-muted-foreground">No referral activity in this range.</p>
              )}
              {data.referralPerformance.map((row) => (
                <div key={row.affiliateId} className="grid grid-cols-4 gap-2 text-sm">
                  <span className="truncate font-medium">{row.affiliateName}</span>
                  <span className="text-right">{row.referrals || "—"}</span>
                  <span className="text-right">{row.closed || "—"}</span>
                  <span className="text-right">
                    {row.feesPaid} / {row.feesPending}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-4">
        <SectionHeading title="Operations" subtitle="Right-now snapshot of the live pipeline, not range-filtered." />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active Deals by Stage</CardTitle>
          </CardHeader>
          <CardContent>
            <StageBarChart
              data={data.operations.activeByStage.map((row) => ({ label: stageLabel(row.stage), count: row.count }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active Deals by Loan Officer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.operations.activeByLoanOfficer.length === 0 && (
              <p className="text-sm text-muted-foreground">No active deals assigned.</p>
            )}
            {data.operations.activeByLoanOfficer.map((row) => (
              <div key={row.userId} className="flex items-center justify-between text-sm">
                <span className="font-medium">{row.name}</span>
                <span className="text-muted-foreground">{row.count}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-4">
        <SectionHeading
          title="Forward Looking"
          subtitle="Pipeline aging — active deals that have sat in their current stage longer than our own historical average for that stage."
        />
        <Card>
          <CardContent className="pt-6">
            {data.pipelineAging.length === 0 && (
              <p className="text-sm text-muted-foreground">No deals are currently running behind their stage&apos;s usual pace.</p>
            )}
            <div className="space-y-2">
              {data.pipelineAging.slice(0, 15).map((row) => (
                <div key={row.dealId} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                  <Link href={`/deals/${row.dealId}`} className="font-medium hover:underline">
                    {row.loanNumber ? `#${row.loanNumber} — ` : ""}
                    {row.borrowerName}
                  </Link>
                  <span className="text-muted-foreground text-xs">
                    {stageLabel(row.stage)} · {row.daysInStage.toFixed(0)}d in stage (avg {row.expectedDays.toFixed(0)}d)
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Industry Reference Points</CardTitle>
            <p className="text-xs text-muted-foreground">
              No non-QM/DSCR-specific industry-association benchmark exists — these are the closest available
              reference points, each labeled with what kind of source it actually is. Use as a rough outside
              comparison, not a precise target, alongside your own historical average above.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {INDUSTRY_BENCHMARKS.map((b) => (
              <div key={b.label} className="border-b pb-3 last:border-0 last:pb-0">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{b.label}</span>
                  <span className="text-muted-foreground">{b.value}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {b.source} — {b.note}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
