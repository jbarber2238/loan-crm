import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { DashboardData } from "@/server/dashboard-metrics";
import { DASHBOARD_RANGES } from "@/lib/dashboard-ranges";
import { STAGES, LOAN_CATEGORIES, labelFor } from "@/lib/labels";
import { PIPELINE_STAGES } from "@/lib/deal-pipeline";
import { INDUSTRY_BENCHMARKS } from "@/lib/dashboard-benchmarks";
import { DrillDownStatCard } from "@/components/dashboard/drill-down-stat-card";
import { MetricsLibrarySheet } from "@/components/dashboard/metrics-library-sheet";
import { PartnerPayoutWidget } from "@/components/dashboard/partner-payout-widget";
import { SidebarSlotPortal } from "@/components/layout/sidebar-slot";
import { cn } from "@/lib/utils";

// The dark appearance's dashboard: the same figures as the default layout (nothing dropped),
// arranged the way the design board lays them out. Only rendered for users who chose dark.

const DISPLAY = "[font-family:var(--font-inter-tight),var(--font-inter),sans-serif]";
const PANEL = "rounded-[22px] border border-[rgba(246,246,246,.08)] bg-[#121315] p-6 flex flex-col gap-4 min-w-0";
const TINTED =
  "rounded-[22px] border border-[rgba(246,246,246,.08)] bg-[linear-gradient(160deg,rgba(250,95,5,.14),rgba(250,95,5,0)_55%),#121315] p-6 flex flex-col gap-4 min-w-0";
const EMPTY =
  "rounded-2xl border border-dashed border-[rgba(246,246,246,.18)] p-5 text-center text-sm text-[rgba(246,246,246,.72)]";
const TH = "px-2 pb-2.5 text-xs font-semibold text-[rgba(246,246,246,.72)]";
const TD = "px-2 py-3 tabular-nums";
const ROW = "border-t border-[rgba(246,246,246,.08)]";
const DIM = "text-[rgba(246,246,246,.72)]";

function stageLabel(stage: string): string {
  return labelFor(STAGES, stage);
}
function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
function pct(n: number | null, digits = 0): string {
  return n === null ? "—" : `${n.toFixed(digits)}%`;
}
function days(n: number | null): string {
  return n === null ? "—" : `${n.toFixed(0)}d`;
}
function daysAndHours(n: number | null): string {
  if (n === null) return "—";
  if (n < 1) return `${Math.round(n * 24)}h`;
  const whole = Math.floor(n);
  const hours = Math.round((n - whole) * 24);
  return hours > 0 ? `${whole}d ${hours}h` : `${whole}d`;
}
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function Panel({
  title,
  subtitle,
  children,
  className,
  tinted,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  tinted?: boolean;
}) {
  return (
    <section className={cn(tinted ? TINTED : PANEL, className)}>
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        {subtitle && <p className={cn("mt-1 text-[13px]", DIM)}>{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mt-2">
      <h2 className="text-[22px] leading-[30px] font-bold">{title}</h2>
      {subtitle && <p className={cn("mt-1 text-[13px]", DIM)}>{subtitle}</p>}
    </div>
  );
}

function OutlineLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-2 self-start rounded-xl border border-[rgba(246,246,246,.2)] px-[18px] text-[13px] font-semibold text-white hover:border-[#fdb78f]"
    >
      {children} <ArrowRight className="size-3.5" />
    </Link>
  );
}

function FunnelBars({ data }: { data: { label: string; count: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  const peak = data.findIndex((d) => d.count === max);
  return (
    <div className="flex h-[250px] items-end gap-2">
      {data.map((d, i) => (
        <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
          <span className={cn("text-sm font-bold", d.count === 0 && DIM)}>{d.count}</span>
          <span
            className="w-full rounded-t-[10px] rounded-b-[4px]"
            style={{
              height: d.count === 0 ? 4 : `${Math.max(6, (d.count / max) * 180)}px`,
              background:
                d.count === 0
                  ? "#333f48"
                  : i === peak && d.count > 0 && data.filter((x) => x.count === max).length === 1
                    ? "linear-gradient(180deg,#fdb78f,#fa5f05)"
                    : "linear-gradient(180deg,#fa5f05,#bc4704)",
            }}
          />
          <span className={cn("h-8 text-center text-[11px] leading-[14px] break-words", DIM)}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

const DONUT_COLORS = ["#fa5f05", "#fdb78f", "#bc4704", "#605d5b", "#333f48", "#a33d03", "#ffd9c2"];

function Donut({ rows, total }: { rows: { label: string; count: number }[]; total: number }) {
  const R = 70;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="relative size-44 shrink-0" role="img" aria-label={`Donut chart of ${total} active deals by stage`}>
      <svg viewBox="0 0 176 176" className="size-full -rotate-90">
        <circle cx="88" cy="88" r={R} fill="none" stroke="#333f48" strokeWidth="16" />
        {total > 0 &&
          rows.map((r, i) => {
            const len = (r.count / total) * C;
            const el = (
              <circle
                key={r.label}
                cx="88"
                cy="88"
                r={R}
                fill="none"
                stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
                strokeWidth="16"
                strokeDasharray={`${Math.max(0, len - 3)} ${C - Math.max(0, len - 3)}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            );
            offset += len;
            return el;
          })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cn("text-4xl leading-10 font-bold", DISPLAY)}>{total}</span>
        <span className="text-[13px] text-[rgba(246,246,246,.78)]">Active deals</span>
      </div>
    </div>
  );
}

function AgeRing({ days: d }: { days: number }) {
  return (
    <span className="relative inline-block size-11 shrink-0">
      <svg viewBox="0 0 44 44" className="size-full -rotate-90">
        <circle cx="22" cy="22" r="19" fill="none" stroke="#333f48" strokeWidth="4" />
        <circle cx="22" cy="22" r="19" fill="none" stroke="#fa5f05" strokeWidth="4" strokeDasharray="108 120" strokeLinecap="round" />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-xs font-bold">{Math.round(d)}d</span>
    </span>
  );
}

export function DashboardDark({
  data,
  range,
  firstName,
}: {
  data: DashboardData;
  range: string;
  firstName: string;
}) {
  const enabled = new Set(data.enabledDashboardMetrics);
  const pc = data.pipelineConversion;

  const lostDisqualifiedEntered = pc.funnel
    .filter((r) => r.stage === "lost" || r.stage === "disqualified")
    .reduce((sum, r) => sum + r.enteredCount, 0);
  const funnelByStage = new Map(pc.funnel.map((r) => [r.stage, r.enteredCount]));
  const funnelData = [
    ...PIPELINE_STAGES.filter((s) => s.value !== "closed").map((s) => ({
      label: s.label,
      count: funnelByStage.get(s.value) ?? 0,
    })),
    { label: "Lost / DQ", count: lostDisqualifiedEntered },
  ];

  const activeRows = data.operations.activeByStage.map((r) => ({ label: stageLabel(r.stage), count: r.count }));
  const activeTotal = activeRows.reduce((s, r) => s + r.count, 0);
  const donutRows = activeRows.filter((r) => r.count > 0);
  const maxTransition = Math.max(0.0001, ...pc.stageTransitionTimes.map((r) => r.avgDays ?? 0));
  const rangeLabel = DASHBOARD_RANGES.find((r) => r.value === range)?.label ?? "";

  // The "Pro Tip": the stage with the most deals running behind its usual pace.
  const agingByStage = new Map<string, number>();
  for (const a of data.pipelineAging) agingByStage.set(a.stage, (agingByStage.get(a.stage) ?? 0) + 1);
  const worst = [...agingByStage.entries()].sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="space-y-5 pb-16">
      {worst && (
        <SidebarSlotPortal>
          <div className="flex flex-col gap-2.5 rounded-[18px] border border-[rgba(246,246,246,.08)] bg-[linear-gradient(160deg,rgba(250,95,5,.16),rgba(250,95,5,.03)_60%),#121315] p-[18px]">
            <span className="text-[15px] font-bold">Pro Tip</span>
            <span className="text-[13px] leading-[19px] text-[rgba(246,246,246,.72)]">
              {worst[1] === 1 ? "One deal has" : `${worst[1]} deals have`} sat in {stageLabel(worst[0])} past the stage
              average. Nudge {worst[1] === 1 ? "it" : "them"} before they go cold.
            </span>
            <a
              href="#pipeline-aging"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[rgba(246,246,246,.2)] text-[13px] font-semibold text-white"
            >
              Review Aging <ArrowRight className="size-3.5" />
            </a>
          </div>
        </SidebarSlotPortal>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1>Dashboard</h1>
          <p className="mt-1 text-sm text-[rgba(246,246,246,.7)]">
            Welcome back, {firstName}. Here is where the pipeline stands.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label="Date range" className="inline-flex flex-wrap rounded-full border border-[rgba(246,246,246,.1)] bg-[#121315] p-1">
            {DASHBOARD_RANGES.map((r) => (
              <Link
                key={r.value}
                role="tab"
                aria-selected={r.value === range}
                href={`/dashboard?range=${r.value}`}
                className={cn(
                  "inline-flex min-h-9 items-center rounded-full px-3.5 text-[13px]",
                  r.value === range ? "bg-[#fa5f05] font-bold text-[#0b0c0d]" : "font-medium text-[rgba(246,246,246,.72)] hover:text-[#fdb78f]"
                )}
              >
                {r.label}
              </Link>
            ))}
          </div>
          <MetricsLibrarySheet enabledMetrics={data.enabledDashboardMetrics} />
        </div>
      </div>

      {/* Pipeline & Conversion */}
      <section className="flex flex-col gap-3.5" aria-label="Pipeline and conversion">
        <div>
          <h2 className="text-[22px] leading-[30px] font-bold">Pipeline &amp; Conversion</h2>
          <p className={cn("mt-1 text-[13px]", DIM)}>
            Today is midnight-to-midnight. Total Pipeline Value and Total Lost Value are real-time snapshots. A restored
            deal drops out immediately, not just on its next stage change.
          </p>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(230px,1fr))] items-start gap-4">
          <DrillDownStatCard tile label="New Leads" value={String(pc.newLeads)} sub="original submissions only, not restores" deals={pc.newLeadsDeals} />
          <DrillDownStatCard tile label="Restored Leads" value={String(pc.restoredLeads)} sub="old deals back in New/Rate Shopping" deals={pc.restoredLeadsDeals} />
          <DrillDownStatCard
            tile
            label="Applications Submitted"
            value={String(pc.applicationsSubmitted)}
            sub={`${pc.applicationsSubmittedDirect} direct · ${pc.applicationsSubmittedRestored} restored`}
            deals={pc.applicationsSubmittedDeals}
          />
          <DrillDownStatCard
            tile
            label="Leads → Applications"
            value={pct(pc.leadToApplicationPct)}
            sub="of this period's New Leads"
            deals={pc.leadToApplicationConvertedDeals}
            emptyMessage="None of this period's New Leads have reached Application yet."
          />
          <PartnerPayoutWidget />
          <DrillDownStatCard
            tile
            label="Leads Lost"
            value={pct(pc.leadLostPct)}
            sub="of this period's New Leads"
            deals={pc.leadLostDeals}
            emptyMessage="None of this period's New Leads are currently Lost/Disqualified."
          />
          <DrillDownStatCard
            tile
            featured
            label="Total Pipeline Value"
            pill={`${pc.totalPipelineValueDeals.length} open`}
            value={money(pc.totalPipelineValue)}
            sub="live, as of now"
            deals={pc.totalPipelineValueDeals}
          />
          <DrillDownStatCard tile label="Total Lost Value" value={money(pc.totalLostValue)} sub="currently sitting in Lost" deals={pc.totalLostValueDeals} />
          <DrillDownStatCard tile label="Loans Closed" value={String(pc.loansClosed)} sub={`${money(pc.totalVolumeClosed)} total volume`} deals={pc.closedDeals} />
          <DrillDownStatCard
            tile
            label="Average Loan Size (Requested)"
            value={money(pc.averageLoanSizeRequested)}
            sub="this period's New Leads"
            deals={pc.leadCohortDeals}
          />
          <DrillDownStatCard tile label="Average Closed Loan Size" value={money(pc.averageLoanSizeClosed)} deals={pc.closedDeals} />
        </div>

        <div className="flex flex-wrap items-stretch gap-4">
          <section className={cn(PANEL, "flex-[2_1_560px]")}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Pipeline Funnel</h2>
                <p className={cn("mt-1 text-[13px]", DIM)}>
                  Deals that entered each core stage this period, in order, plus everything Lost or Disqualified.
                </p>
              </div>
              <span className="rounded-xl border border-[rgba(246,246,246,.14)] px-3.5 py-2 text-[13px] font-semibold">{rangeLabel}</span>
            </div>
            <FunnelBars data={funnelData} />
          </section>

          <section className={cn(PANEL, "flex-[1_1_340px]")}>
            <h2 className="text-lg font-bold">Active Deals by Stage</h2>
            <div className="flex flex-1 flex-wrap items-center justify-center gap-6">
              <Donut rows={donutRows} total={activeTotal} />
              <ul className="flex flex-col gap-4">
                {donutRows.length === 0 && <li className={cn("text-sm", DIM)}>No active deals.</li>}
                {donutRows.map((r, i) => (
                  <li key={r.label} className="flex items-start gap-2.5">
                    <span className="mt-[5px] size-2.5 shrink-0 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                    <div>
                      <div className="text-sm font-semibold">{r.label}</div>
                      <div className="text-[13px] text-[rgba(246,246,246,.72)]">
                        {r.count} {r.count === 1 ? "deal" : "deals"} ({Math.round((r.count / activeTotal) * 100)}%)
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-1.5 border-t border-[rgba(246,246,246,.08)] pt-3.5 text-[13px] text-[rgba(246,246,246,.78)]">
              <span>Active deals by loan officer</span>
              {data.operations.activeByLoanOfficer.length === 0 && <span>No active deals assigned.</span>}
              {data.operations.activeByLoanOfficer.map((lo) => (
                <div key={lo.userId} className="flex items-center justify-between">
                  <span>{lo.name}</span>
                  <span className="font-bold text-white">{lo.count}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>

      {/* Aging + lenders */}
      <section className="flex flex-wrap items-stretch gap-4">
        <section id="pipeline-aging" className={cn(PANEL, "flex-[2_1_560px] scroll-mt-24")}>
          <div>
            <h2 className="text-lg font-bold">Pipeline Aging</h2>
            <p className={cn("mt-1 text-[13px]", DIM)}>
              Active deals sitting longer than the stage&apos;s historical average
            </p>
          </div>
          {data.pipelineAging.length === 0 ? (
            <p className={EMPTY}>No deals are currently running behind their stage&apos;s usual pace.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-[13px]">
                <thead>
                  <tr className="text-left text-[rgba(246,246,246,.72)]">
                    <th className="py-2 pr-2 font-medium">Deal</th>
                    <th className="px-2 py-2 font-medium">In stage</th>
                    <th className="px-2 py-2 font-medium">Over avg</th>
                    <th className="px-2 py-2 font-medium">Stage</th>
                    <th className="px-2 py-2 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.pipelineAging.slice(0, 15).map((row) => (
                    <tr key={row.dealId} className={ROW}>
                      <td className="py-3.5 pr-2">
                        <Link href={`/deals/${row.dealId}`} className="flex items-center gap-3 hover:underline">
                          <span
                            aria-hidden="true"
                            className="grid size-10 shrink-0 place-items-center rounded-full bg-[#333f48] text-[13px] font-bold"
                          >
                            {initials(row.borrowerName)}
                          </span>
                          <span>
                            <span className="block text-sm font-semibold">{row.borrowerName}</span>
                            <span className="block text-xs text-[rgba(246,246,246,.7)]">
                              {row.loanNumber ? `#${row.loanNumber} · ` : ""}
                              {labelFor(LOAN_CATEGORIES, row.loanCategory)}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-2 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <AgeRing days={row.daysInStage} />
                          <span className={DIM}>avg {Math.round(row.expectedDays)}d</span>
                        </div>
                      </td>
                      <td className="px-2 py-3.5">
                        <span className="rounded-full bg-[rgba(250,95,5,.16)] px-2.5 py-1 font-bold text-[#fdb78f]">
                          +{Math.max(1, Math.round(row.daysInStage - row.expectedDays))}d
                        </span>
                      </td>
                      <td className="px-2 py-3.5">{stageLabel(row.stage)}</td>
                      <td className="px-2 py-3.5 font-semibold tabular-nums">{money(row.loanAmountRequested)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <OutlineLink href="/pipeline">View Full Pipeline</OutlineLink>
        </section>

        <section className={cn(PANEL, "flex-[1_1_340px]")}>
          <div>
            <h2 className="text-lg font-bold">Lender Performance</h2>
            <p className={cn("mt-1 text-[13px]", DIM)}>Priced with, chosen, closed, lost, and average time to close once chosen.</p>
          </div>
          {data.lenderPerformance.length === 0 ? (
            <p className={EMPTY}>No data in this range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={cn(TH, "text-left")}>Lender</th>
                    <th className={cn(TH, "text-right")}>Priced</th>
                    <th className={cn(TH, "text-right")}>Chosen</th>
                    <th className={cn(TH, "text-right")}>Closed</th>
                    <th className={cn(TH, "text-right")}>Lost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lenderPerformance.map((row) => (
                    <tr key={row.lenderId} className={ROW}>
                      <td className="px-2 py-3 font-semibold">
                        {row.lenderName}
                        {row.averageDaysToClose !== null && (
                          <span className="block text-xs font-normal text-[rgba(246,246,246,.66)]">{days(row.averageDaysToClose)} avg to close</span>
                        )}
                      </td>
                      {[row.priced, row.chosen, row.closed, row.lost].map((v, i) => (
                        <td key={i} className={cn(TD, "text-right", !v && DIM)}>
                          {v || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <OutlineLink href="/lenders">View All Lenders</OutlineLink>
        </section>
      </section>

      {/* Timing + revenue */}
      <section className="flex flex-wrap items-stretch gap-4">
        <section className={cn(PANEL, "flex-[2_1_560px] gap-[18px]")}>
          <div>
            <h2 className="text-lg font-bold">Stage-to-Stage Timing</h2>
            <p className={cn("mt-1 text-[13px]", DIM)}>Days and hours between key early stages.</p>
          </div>
          {pc.stageTransitionTimes.map((row) => (
            <div key={row.label} className="flex flex-col gap-1.5">
              <div className="flex justify-between text-[13px]">
                <span>{row.label}</span>
                <span className="font-bold">
                  {daysAndHours(row.avgDays)}
                  {row.count > 0 && <span className="ml-2 font-normal text-[rgba(246,246,246,.66)]">· {row.count} deals</span>}
                </span>
              </div>
              <div role="img" aria-label={daysAndHours(row.avgDays)} className="h-2.5 rounded-full bg-[#333f48]">
                <div
                  className="h-2.5 rounded-full"
                  style={{
                    width: `${Math.max(2, ((row.avgDays ?? 0) / maxTransition) * 100)}%`,
                    background:
                      (row.avgDays ?? 0) >= maxTransition
                        ? "linear-gradient(90deg,#fa5f05,#fdb78f)"
                        : "linear-gradient(90deg,#bc4704,#fa5f05)",
                  }}
                />
              </div>
            </div>
          ))}
        </section>

        <section className={cn(TINTED, "flex-[1_1_340px]")}>
          <h2 className="text-lg font-bold">Cost &amp; Profitability</h2>
          <div className="flex flex-wrap gap-3">
            <div className="flex-[1_1_130px] rounded-2xl border border-[#fa5f05] bg-[rgba(250,95,5,.08)] p-4">
              <div className={cn("text-[28px] leading-8 font-bold tabular-nums", DISPLAY)}>{money(data.costProfitability.projectedRevenue)}</div>
              <div className="mt-1 text-xs text-[rgba(246,246,246,.78)]">Projected revenue: open deals expected to close in this period</div>
            </div>
            <div className="flex-[1_1_130px] rounded-2xl border border-[rgba(246,246,246,.08)] bg-[#17191b] p-4">
              <div className={cn("text-[28px] leading-8 font-bold tabular-nums", DISPLAY)}>{money(data.costProfitability.closedRevenue)}</div>
              <div className="mt-1 text-xs text-[rgba(246,246,246,.78)]">Closed revenue</div>
            </div>
          </div>
          {data.loanOfficerPerformance.map((lo) => (
            <div key={lo.userId} className="flex items-center justify-between text-[13px] text-[rgba(246,246,246,.78)]">
              <span>{lo.name}, lead → app</span>
              <span className="font-bold text-white">{pct(lo.leadToApplicationPct)}</span>
            </div>
          ))}
          {enabled.has("avg_origination_points_by_loan_type") && (
            <div className="flex flex-col gap-2 border-t border-[rgba(246,246,246,.08)] pt-3.5">
              <p className="text-sm font-semibold">Average Origination Points, by Loan Type</p>
              {data.costProfitability.avgOriginationPointsByLoanType.length === 0 && (
                <p className={cn("text-sm", DIM)}>No data in this range.</p>
              )}
              {data.costProfitability.avgOriginationPointsByLoanType.map((row) => (
                <div key={row.loanCategory} className="flex items-center justify-between text-[13px]">
                  <span>{labelFor(LOAN_CATEGORIES, row.loanCategory)}</span>
                  <span className={DIM}>
                    {row.averagePoints.toFixed(2)} pts · {row.count} closed
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>

      {/* Speed, quality and risk */}
      <SectionTitle title="Speed, quality and risk" subtitle="Closed loans only, within the selected range." />
      <section className="flex flex-wrap items-stretch gap-4">
        <Panel title="Speed to Close, by Loan Type" subtitle="Lead → close, and application → close." className="flex-[1_1_340px]">
          {pc.speedLeadToClose.length === 0 ? (
            <p className={EMPTY}>No closed deals in this range.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {pc.speedLeadToClose.map((row) => {
                const appToClose = pc.speedApplicationToClose.find((r) => r.loanCategory === row.loanCategory);
                return (
                  <div key={row.loanCategory} className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold">{labelFor(LOAN_CATEGORIES, row.loanCategory)}</span>
                    <span className={cn("text-right", DIM)}>
                      {row.averageDays.toFixed(0)}d lead→close
                      {appToClose && ` · ${appToClose.averageDays.toFixed(0)}d app→close`}
                      {` · ${row.closedCount} closed`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="Loan Officer Performance" className="flex-[2_1_520px]">
          {data.loanOfficerPerformance.length === 0 ? (
            <p className={EMPTY}>No data in this range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={cn(TH, "text-left")}>Loan Officer</th>
                    <th className={cn(TH, "text-right")}>Closed</th>
                    <th className={cn(TH, "text-right")}>Volume</th>
                    <th className={cn(TH, "text-right")}>Revenue</th>
                    <th className={cn(TH, "text-right")}>Avg Deal</th>
                    <th className={cn(TH, "text-right")}>Lead→App / App→Close</th>
                  </tr>
                </thead>
                <tbody>
                  {data.loanOfficerPerformance.map((row) => (
                    <tr key={row.userId} className={ROW}>
                      <td className="px-2 py-3 font-semibold">{row.name}</td>
                      <td className={cn(TD, "text-right", !row.closedCount && DIM)}>{row.closedCount || "—"}</td>
                      <td className={cn(TD, "text-right")}>{money(row.closedVolume)}</td>
                      <td className={cn(TD, "text-right")}>{money(row.revenue)}</td>
                      <td className={cn(TD, "text-right", !row.averageDealSize && DIM)}>{row.averageDealSize ? money(row.averageDealSize) : "—"}</td>
                      <td className={cn(TD, "text-right", DIM)}>
                        {pct(row.leadToApplicationPct)} / {pct(row.applicationToClosePct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </section>

      <Panel title="Loan Quality & Risk" subtitle="Closed loans only, within the selected range.">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
          {[
            { k: "Average LTV at Closing", v: pct(data.loanQuality.averageLtvAtClosing, 1), n: undefined },
            {
              k: "Average DSCR Ratio",
              v: data.loanQuality.averageDscrAtClosing !== null ? data.loanQuality.averageDscrAtClosing.toFixed(2) : "—",
              n: "DSCR/Portfolio closed loans",
            },
            {
              k: "Average FICO",
              v: data.loanQuality.averageEstimatedFicoClosed !== null ? String(Math.round(data.loanQuality.averageEstimatedFicoClosed)) : "—",
              n: "borrower-estimated at intake, not pulled credit",
            },
            {
              k: "Appraisal Accuracy",
              v: pct(data.loanQuality.appraisalAccuracy.pctBelowExpected),
              n: data.loanQuality.appraisalAccuracy.sampleSize
                ? `came in below expected, avg ${pct(data.loanQuality.appraisalAccuracy.averagePctUnder, 1)} under (n=${data.loanQuality.appraisalAccuracy.sampleSize})`
                : "no appraisal data in range",
            },
          ].map((t) => (
            <div key={t.k} className="flex min-h-[110px] flex-col gap-1 rounded-2xl border border-[rgba(246,246,246,.1)] bg-[rgba(6,6,7,.55)] p-4">
              <span className="text-[13px] text-[rgba(246,246,246,.78)]">{t.k}</span>
              <span className={cn("text-[28px] leading-8 font-bold", DISPLAY)}>{t.v}</span>
              {t.n && <span className="text-xs text-[rgba(246,246,246,.66)]">{t.n}</span>}
            </div>
          ))}
        </div>
      </Panel>

      {/* Lender relationship health */}
      <SectionTitle title="Lender relationship health" subtitle="Where deals are lost and how concentrated closed volume is." />
      <section className="flex flex-wrap items-stretch gap-4">
        <Panel title="Application-Stage Losses by Lender" className="flex-[1_1_340px]">
          {data.lenderLoss.length === 0 ? (
            <p className={EMPTY}>No data in this range.</p>
          ) : (
            data.lenderLoss.map((row) => (
              <div key={row.lenderId} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{row.lenderName}</span>
                  <span className={DIM}>
                    {row.lostOrDisqualified} / {row.reachedApplication} ({pct((row.lostOrDisqualified / row.reachedApplication) * 100)})
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[#333f48]">
                  <div
                    className="h-2 rounded-full bg-[linear-gradient(90deg,#bc4704,#fa5f05)]"
                    style={{ width: `${Math.min(100, (row.lostOrDisqualified / row.reachedApplication) * 100)}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </Panel>
        <Panel title="Wallet Share by Lender" subtitle="% of closed volume. Watch for over-concentration." className="flex-[1_1_340px]">
          {data.walletShare.length === 0 ? (
            <p className={EMPTY}>No closed deals in this range.</p>
          ) : (
            data.walletShare.map((row) => (
              <div key={row.lenderId} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{row.lenderName}</span>
                  <span className={DIM}>
                    {money(row.volume)} ({pct(row.pct)})
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[#333f48]">
                  <div className="h-2 rounded-full bg-[linear-gradient(90deg,#bc4704,#fa5f05)]" style={{ width: `${Math.min(100, row.pct)}%` }} />
                </div>
              </div>
            ))
          )}
        </Panel>
      </section>

      <Panel
        title="Lender Turn Times"
        subtitle="Approximated from our own button clicks (no lender-reply timestamp exists): Price Loan → term sheet drafted, and Application → Closed."
      >
        {data.lenderTurnTimes.length === 0 ? (
          <p className={EMPTY}>No data in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[28rem] border-collapse text-sm">
              <thead>
                <tr>
                  <th className={cn(TH, "text-left")}>Lender</th>
                  <th className={cn(TH, "text-right")}>Time to Term Sheet</th>
                  <th className={cn(TH, "text-right")}>Time to Close</th>
                </tr>
              </thead>
              <tbody>
                {data.lenderTurnTimes.map((row) => (
                  <tr key={row.lenderId} className={ROW}>
                    <td className="px-2 py-3 font-semibold">{row.lenderName}</td>
                    <td className={cn(TD, "text-right")}>{daysAndHours(row.averageDaysToTermSheet)}</td>
                    <td className={cn(TD, "text-right", row.averageDaysToClose === null && DIM)}>{days(row.averageDaysToClose)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <section className="flex flex-wrap items-stretch gap-4">
        <Panel title="Referral Partner Performance" className="flex-[1_1_340px]">
          {data.referralPerformance.length === 0 ? (
            <p className={EMPTY}>No referral activity in this range.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className={cn(TH, "text-left")}>Partner</th>
                    <th className={cn(TH, "text-right")}>Referrals</th>
                    <th className={cn(TH, "text-right")}>Closed</th>
                    <th className={cn(TH, "text-right")}>Fees Paid / Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {data.referralPerformance.map((row) => (
                    <tr key={row.affiliateId} className={ROW}>
                      <td className="px-2 py-3 font-semibold">{row.affiliateName}</td>
                      <td className={cn(TD, "text-right", !row.referrals && DIM)}>{row.referrals || "—"}</td>
                      <td className={cn(TD, "text-right", !row.closed && DIM)}>{row.closed || "—"}</td>
                      <td className={cn(TD, "text-right")}>
                        {row.feesPaid} / {row.feesPending}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        <Panel title="Active Deals by Stage (right now)" subtitle="Right-now snapshot of the live pipeline, not range-filtered." className="flex-[1_1_340px]">
          <ul className="flex flex-wrap gap-2">
            {activeRows.map((r) => (
              <li
                key={r.label}
                className={cn(
                  "inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-[13px]",
                  r.count > 0 ? "bg-[rgba(250,95,5,.16)] text-[#fdb78f]" : "bg-[rgba(246,246,246,.06)] text-[rgba(246,246,246,.78)]"
                )}
              >
                {r.label} <span className="font-bold">{r.count}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </section>

      <Panel
        title="Industry Reference Points"
        subtitle="No non-QM/DSCR-specific industry-association benchmark exists. These are the closest available reference points, each labeled with what kind of source it is. Use as a rough outside comparison, not a precise target."
      >
        <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3.5">
          {INDUSTRY_BENCHMARKS.map((b) => (
            <div key={b.label} className="flex flex-col gap-1.5 rounded-2xl border border-[rgba(246,246,246,.1)] bg-[rgba(6,6,7,.55)] p-4">
              <span className="text-[13px] text-[rgba(246,246,246,.78)]">{b.label}</span>
              <span className={cn("text-lg leading-6 font-bold", DISPLAY)}>{b.value}</span>
              <span className="text-xs text-[rgba(246,246,246,.66)]">
                {b.source}. {b.note}
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
