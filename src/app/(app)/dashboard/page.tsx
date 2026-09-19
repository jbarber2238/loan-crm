import Link from "next/link";
import { requireAdmin } from "@/server/auth/guards";
import { buildDashboardData } from "@/server/dashboard-metrics";
import { DASHBOARD_RANGES, DEFAULT_DASHBOARD_RANGE, isDashboardRange } from "@/lib/dashboard-ranges";
import { STAGES, LOAN_CATEGORIES, labelFor } from "@/lib/labels";
import { InlineBar } from "@/components/dashboard/inline-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function stageLabel(stage: string): string {
  return labelFor(STAGES, stage);
}

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function pct(part: number, whole: number): string {
  if (!whole) return "—";
  return `${((part / whole) * 100).toFixed(0)}%`;
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

  return (
    <div className="space-y-6">
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Closed Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{money(data.volume.totalVolume)}</p>
            <p className="text-xs text-muted-foreground">{data.volume.closedCount} closed deals</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Average Loan Size</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{money(data.volume.averageLoanSize)}</p>
            <p className="text-xs text-muted-foreground">across closed deals in range</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Deals In Motion</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.funnel.reduce((sum, r) => sum + r.enteredCount, 0)}</p>
            <p className="text-xs text-muted-foreground">stage entries across every stage this period</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pipeline Funnel</CardTitle>
          <p className="text-xs text-muted-foreground">
            For every stage, what actually happened next to the deals that entered it — not an assumed flow, the
            real observed one.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.funnel.length === 0 && <p className="text-sm text-muted-foreground">No stage activity in this range.</p>}
          {data.funnel.map((row) => (
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
                    <span className="w-20 shrink-0 text-right font-medium">
                      {n.count} ({pct(n.count, row.enteredCount)})
                    </span>
                  </div>
                ))}
                {row.stillHereCount > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-32 shrink-0 text-muted-foreground">Still here</span>
                    <InlineBar percent={(row.stillHereCount / row.enteredCount) * 100} className="max-w-40" />
                    <span className="w-20 shrink-0 text-right font-medium">
                      {row.stillHereCount} ({pct(row.stillHereCount, row.enteredCount)})
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
            <CardTitle className="text-base">Application-Stage Losses by Lender</CardTitle>
            <p className="text-xs text-muted-foreground">
              Of deals that reached Application with a lender chosen, how many ended Lost/Disqualified.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.lenderLoss.length === 0 && <p className="text-sm text-muted-foreground">No data in this range.</p>}
            {data.lenderLoss.map((row) => (
              <div key={row.lenderId} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{row.lenderName}</span>
                  <span className="text-muted-foreground">
                    {row.lostOrDisqualified} / {row.reachedApplication} ({pct(row.lostOrDisqualified, row.reachedApplication)})
                  </span>
                </div>
                <InlineBar percent={(row.lostOrDisqualified / row.reachedApplication) * 100} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lender Performance</CardTitle>
            <p className="text-xs text-muted-foreground">Priced with, actually chosen, and actually closed.</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-2 text-xs font-medium text-muted-foreground">
                <span>Lender</span>
                <span className="text-right">Priced</span>
                <span className="text-right">Chosen</span>
                <span className="text-right">Closed</span>
              </div>
              {data.lenderPerformance.length === 0 && (
                <p className="text-sm text-muted-foreground">No data in this range.</p>
              )}
              {data.lenderPerformance.map((row) => (
                <div key={row.lenderId} className="grid grid-cols-4 gap-2 text-sm">
                  <span className="truncate font-medium">{row.lenderName}</span>
                  <span className="text-right">{row.priced || "—"}</span>
                  <span className="text-right">{row.chosen || "—"}</span>
                  <span className="text-right">{row.closed || "—"}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Speed to Close, by Loan Type</CardTitle>
            <p className="text-xs text-muted-foreground">Average days from lead to closed.</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.speed.length === 0 && <p className="text-sm text-muted-foreground">No closed deals in this range.</p>}
              {data.speed.map((row) => (
                <div key={row.loanCategory} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{labelFor(LOAN_CATEGORIES, row.loanCategory)}</span>
                  <span className="text-muted-foreground">
                    {row.averageDaysToClose.toFixed(0)}d avg · {row.closedCount} closed
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
