import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/guards";
import { getLeads } from "@/server/actions/leads";
import { LeadsKanbanBoard, type BoardLead } from "@/components/board/leads-kanban-board";

export default async function LeadsPipelinePage() {
  const user = await requireUser();
  if (!user.isAdmin && user.baseRole !== "loan_officer") redirect("/pipeline");

  const leads = await getLeads();

  const boardLeads: BoardLead[] = leads.map((lead) => ({
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    source: lead.source,
    status: lead.status,
    lastActivityAt: lead.lastActivityAt.toISOString(),
    lastCalculatorInputs: lead.lastCalculatorInputs,
    lastCalculatorResults: lead.lastCalculatorResults,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {leads.length} lead{leads.length === 1 ? "" : "s"} from the marketing site&apos;s gated tools.
        </p>
        <Link href="/pipeline/leads/call-list" className="text-sm font-medium text-primary underline">
          Call List →
        </Link>
      </div>

      {leads.length === 0 ? (
        <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">No leads yet.</p>
      ) : (
        <LeadsKanbanBoard leads={boardLeads} />
      )}
    </div>
  );
}
