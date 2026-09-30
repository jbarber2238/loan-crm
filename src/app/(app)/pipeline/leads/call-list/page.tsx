import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/guards";
import { getLeads } from "@/server/actions/leads";
import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import { MarkContactedButton } from "@/components/leads/mark-contacted-button";
import { leadDealSummary } from "@/lib/lead-format";

const CALL_LIST_STATUSES = ["hot", "engaged", "new"] as const;
const STATUS_RANK: Record<string, number> = { hot: 0, engaged: 1, new: 2 };

export default async function CallListPage() {
  const user = await requireUser();
  if (!user.isAdmin && user.baseRole !== "loan_officer") redirect("/pipeline");

  const allLeads = await getLeads();
  const callList = allLeads
    .filter((l) => (CALL_LIST_STATUSES as readonly string[]).includes(l.status))
    .sort((a, b) => {
      const rankDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status];
      if (rankDiff !== 0) return rankDiff;
      return b.lastActivityAt.getTime() - a.lastActivityAt.getTime();
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Call List</h1>
          <p className="text-sm text-muted-foreground">Hot leads first, then Engaged, then New — newest activity first.</p>
        </div>
        <Link href="/pipeline/leads" className="text-sm text-muted-foreground underline hover:text-foreground">
          ← All Leads
        </Link>
      </div>

      {callList.length === 0 ? (
        <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">Nothing to call right now.</p>
      ) : (
        <div className="space-y-2">
          {callList.map((lead) => (
            <div key={lead.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Link href={`/pipeline/leads/${lead.id}`} className="font-medium hover:underline">
                    {lead.name}
                  </Link>
                  <LeadStatusBadge status={lead.status} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {lead.source} · Last activity {lead.lastActivityAt.toLocaleString()}
                </p>
                {leadDealSummary(lead.lastCalculatorInputs, lead.lastCalculatorResults) && (
                  <p className="mt-1 text-sm font-medium">
                    {leadDealSummary(lead.lastCalculatorInputs, lead.lastCalculatorResults)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <a href={`tel:${lead.phone}`} className="text-sm font-medium text-primary underline">
                  {lead.phone}
                </a>
                <MarkContactedButton leadId={lead.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
