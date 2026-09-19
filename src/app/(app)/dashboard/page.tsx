import Link from "next/link";
import { requireAdmin } from "@/server/auth/guards";
import { buildDashboardData } from "@/server/dashboard-metrics";
import { DASHBOARD_RANGES, DEFAULT_DASHBOARD_RANGE, isDashboardRange } from "@/lib/dashboard-ranges";
import { DASHBOARD_SECTIONS, libraryMetricsFor } from "@/lib/dashboard-metric-library";
import { STAGES, LOAN_CATEGORIES, labelFor } from "@/lib/labels";
import { InlineBar } from "@/components/dashboard/inline-bar";
import { MetricToggle } from "@/components/dashboard/metric-toggle";
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

  return (
    <div className="space-y-10 pb-16">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold">Dashboard</h1>
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
      </div>

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-4">
        <SectionHeading
          title="Pipeline & Conversion"
          subtitle="Total Pipeline Value is a right-now snapshot; everything else is scoped to the selected range."
        />

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="New Leads" value={String(data.pipelineConversion.newLeads)} />
          <StatCard label="Applications Submitted" value={String(data.pipelineConversion.applicationsSubmitted)} />
          <StatCard label="Leads → Applications" value={pct(data.pipelineConversion.leadToApplicationPct)} />
          <StatCard label="Leads Lost" value={pct(data.pipelineConversion.leadLostPct)} />
          <StatCard label="Total Pipeline Value" value={money(data.pipelineConversion.totalPipelineValue)} sub="active deals, as of now" />
          <StatCard label="Total Lost Value" value={money(data.pipelineConversion.totalLostValue)} />
          <StatCard
            label="Loans Closed"
            value={String(data.pipelineConversion.loansClosed)}
            sub={money(data.pipelineConversion.totalVolumeClosed) + " total volume"}
          />
          <StatCard label="Average Loan Size" value={money(data.pipelineConversion.averageLoanSizeClosed)} />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline Funnel</CardTitle>
            <p className="text-xs text-muted-foreground">
              For every stage, what actually happened next to the deals that entered it.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.pipelineConversion.funnel.length === 0 && (
              <p className="text-sm text-muted-foreground">No stage activity in this range.</p>
            )}
            {data.pipelineConversion.funnel.map((row) => (
              <div key={row.stage} className="space-y-1.5 border-b pb-3 last:border-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{stageLabel(row.stage)}</p>
                  <p className="text-sm text-muted-foreground">{row.enteredCount} entered</p>
                </div>
                <div className="space-y-1 pl-3">
                  {row.nextStageCounts.map((n) => (
                    <div key={n.stage} className="flex items-center gap-2 text-xs">
                      <span className="w-32 shrink-0 text-muted-foreground">→ {stageLabel(n.stage)}</span>
                      <InlineBar percent={(n.count / row.enteredCount) * 100} className="max-w-40" />
                      <span className="w-24 shrink-0 text-right font-medium">
                        {n.count} ({pct((n.count / row.enteredCount) * 100)})
                      </span>
                    </div>
                  ))}
                  {row.stillHereCount > 0 && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-32 shrink-0 text-muted-foreground">Still here</span>
                      <InlineBar percent={(row.stillHereCount / row.enteredCount) * 100} className="max-w-40" />
                      <span className="w-24 shrink-0 text-right font-medium">
                        {row.stillHereCount} ({pct((row.stillHereCount / row.enteredCount) * 100)})
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Stage-to-Stage Timing</CardTitle>
              <p className="text-xs text-muted-foreground">Average days between key early stages.</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.pipelineConversion.stageTransitionTimes.map((row) => (
                <div key={row.label} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{row.label}</span>
                  <span className="text-muted-foreground">
                    {days(row.avgDays)} avg {row.count > 0 && `· ${row.count} deals`}
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
              Lender responsiveness, separate from our own internal timelines.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2 text-xs font-medium text-muted-foreground">
                <span>Lender</span>
                <span className="text-right">Time to Term Sheet</span>
                <span className="text-right">Time to Clear-to-Close</span>
              </div>
              {data.lenderTurnTimes.length === 0 && <p className="text-sm text-muted-foreground">No data in this range.</p>}
              {data.lenderTurnTimes.map((row) => (
                <div key={row.lenderId} className="grid grid-cols-3 gap-2 text-sm">
                  <span className="truncate font-medium">{row.lenderName}</span>
                  <span className="text-right">{days(row.averageDaysToTermSheet)}</span>
                  <span className="text-right">{days(row.averageDaysToClearToClose)}</span>
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
        <SectionHeading title="Cost & Profitability" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-2">
          <StatCard label="Projected Revenue" value={money(data.costProfitability.projectedRevenue)} sub="active deals, as of now" />
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
        <SectionHeading title="Operations" subtitle="Right-now snapshot of the live pipeline, not range-filtered." />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Active Deals by Stage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {data.operations.activeByStage.map((row) => (
                <div key={row.stage} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{stageLabel(row.stage)}</span>
                  <span className="text-muted-foreground">{row.count}</span>
                </div>
              ))}
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
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-4">
        <SectionHeading
          title="Forward Looking"
          subtitle="Pipeline aging — active deals that have sat in their current stage longer than the historical average for that stage."
        />
        <Card>
          <CardContent className="pt-6">
            {data.pipelineAging.length === 0 && (
              <p className="text-sm text-muted-foreground">No deals are currently running behind their stage's usual pace.</p>
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
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-4">
        <SectionHeading
          title="Metrics Library"
          subtitle="Metrics that exist but aren't shown above by default, plus metrics not yet buildable — each needs a data source this app doesn't collect yet."
        />
        <Card>
          <CardContent className="pt-6 space-y-4">
            {DASHBOARD_SECTIONS.map(({ value, label }) => {
              const metrics = libraryMetricsFor(value);
              if (metrics.length === 0) return null;
              return (
                <div key={value} className="space-y-2 border-b pb-4 last:border-0 last:pb-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                  {metrics.map((m) => (
                    <div key={m.id} className="flex items-start justify-between gap-3 text-sm">
                      <div>
                        <p className="font-medium">{m.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {m.description}
                          {!m.computable && m.needs && <span className="italic"> Needs: {m.needs}.</span>}
                        </p>
                      </div>
                      {m.computable ? (
                        <div className="flex items-center gap-2 shrink-0 pt-0.5">
                          <span className="text-xs text-muted-foreground">Show on dashboard</span>
                          <MetricToggle metricId={m.id} enabled={enabled.has(m.id)} />
                        </div>
                      ) : (
                        <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                          Coming soon
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
