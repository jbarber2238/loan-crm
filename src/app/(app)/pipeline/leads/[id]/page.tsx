import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/server/auth/guards";
import { getLeadDetail } from "@/server/actions/leads";
import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import { LeadStatusSelect } from "@/components/leads/lead-status-select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

const CALCULATOR_LABELS: Record<string, string> = {
  arv: "After-Repair Value",
  rehabBudget: "Rehab Budget",
  offerPct: "Percent of ARV",
  purchasePrice: "Purchase Price",
  ltcPct: "Loan-to-Cost",
  ltarvPct: "Loan-to-ARV",
  carryRatePct: "Carrying Rate",
  timelineMonths: "Timeline (months)",
  acqPct: "Acquisition Closing %",
  originationPts: "Lender Points",
  dispoPct: "Disposition Closing %",
  loanAmount: "Loan Amount",
  totalInterest: "Total Interest",
  totalHolding: "Total Holding Costs",
  profit: "Profit",
  profitMarginPct: "Profit Margin",
  cashInvested: "Cash Invested",
  cashOnCashPct: "Cash-on-Cash Return",
};

function formatCalculatorValue(key: string, value: number): string {
  if (key.endsWith("Pct")) return `${value.toFixed(1)}%`;
  if (key === "timelineMonths") return `${value} mo`;
  if (key === "originationPts") return `${value} pts`;
  return money(value);
}

function CalculatorSnapshot({ title, data }: { title: string; data: unknown }) {
  const entries = Object.entries((data ?? {}) as Record<string, number>);
  if (!entries.length) return null;
  return (
    <div>
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
        {entries.map(([key, value]) => (
          <div key={key}>
            <dt className="text-xs text-muted-foreground">{CALCULATOR_LABELS[key] ?? key}</dt>
            <dd className="text-sm font-medium">{formatCalculatorValue(key, value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function activityLabel(type: string): string {
  const labels: Record<string, string> = {
    form_submitted: "Submitted the form",
    calculator_used: "Used the calculator",
    excel_downloaded: "Downloaded the Excel version",
    cta_clicked: "Clicked a call-to-action",
    deal_question_answered: "Answered deal questions",
    email_sent: "Email sent",
    call_logged: "Call logged",
    status_changed: "Status changed",
    converted_to_deal: "Converted to a deal",
  };
  return labels[type] ?? type;
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user.isAdmin && user.baseRole !== "loan_officer") redirect("/pipeline");

  const { id } = await params;
  const lead = await getLeadDetail(id);
  if (!lead) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/pipeline/leads" className="text-sm text-muted-foreground underline hover:text-foreground">
        ← All Leads
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{lead.name}</h1>
            <LeadStatusBadge status={lead.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {lead.source} · First seen {lead.createdAt.toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LeadStatusSelect leadId={lead.id} status={lead.status} />
          {!lead.convertedDealId && (
            <Button asChild size="sm">
              <Link
                href={`/deals/new?leadId=${lead.id}&phone=${encodeURIComponent(lead.phone)}&name=${encodeURIComponent(lead.name)}&email=${encodeURIComponent(lead.email)}`}
              >
                Convert to Deal
              </Link>
            </Button>
          )}
          {lead.convertedDealId && (
            <Button asChild size="sm" variant="outline">
              <Link href={`/deals/${lead.convertedDealId}`}>View Deal</Link>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Phone</p>
            <a href={`tel:${lead.phone}`} className="text-sm font-medium hover:underline">
              {lead.phone}
            </a>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <a href={`mailto:${lead.email}`} className="text-sm font-medium hover:underline">
              {lead.email}
            </a>
          </div>
          {lead.hasDealUnderContract !== null && (
            <div>
              <p className="text-xs text-muted-foreground">Deal under contract?</p>
              <p className="text-sm font-medium">{lead.hasDealUnderContract ? "Yes" : "No"}</p>
            </div>
          )}
          {lead.closingTimeline && (
            <div>
              <p className="text-xs text-muted-foreground">Closing timeline</p>
              <p className="text-sm font-medium">{lead.closingTimeline}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {Boolean(lead.lastCalculatorInputs || lead.lastCalculatorResults) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Calculator Numbers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <CalculatorSnapshot title="Inputs" data={lead.lastCalculatorInputs} />
            <CalculatorSnapshot title="Results" data={lead.lastCalculatorResults} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {lead.activities.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
          {lead.activities.map((activity) => (
            <div key={activity.id} className="flex items-baseline justify-between border-b pb-2 text-sm last:border-0 last:pb-0">
              <span>{activityLabel(activity.type)}</span>
              <span className="text-xs text-muted-foreground">{activity.createdAt.toLocaleString()}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
