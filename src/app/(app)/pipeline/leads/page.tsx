import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/guards";
import { getLeads } from "@/server/actions/leads";
import { LeadsKanbanBoard, type BoardLead } from "@/components/board/leads-kanban-board";
import { PipelineTabs } from "@/components/board/pipeline-tabs";

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
      {/* Dark appearance: the board's page title and view tabs, then the same count and links as a hero banner. */}
      <div className="theme-dark-only space-y-4">
        <h1>Pipeline</h1>
        <PipelineTabs showLeads />
      </div>
      <section
        data-pipeline-banner
        className="theme-dark-only !flex flex-wrap items-end justify-between rounded-xl"
        aria-label="Active leads"
      >
        <div>
          <p data-banner-eyebrow className="uppercase">Active leads</p>
          <p data-banner-value className="mt-1.5">{leads.length}</p>
          <p className="mt-1 text-[13px] text-[rgba(255,255,255,.82)]">From the marketing site&apos;s gated tools</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/pipeline/leads/friday"
            className="inline-flex min-h-11 items-center rounded-full bg-[#0b0c0d] px-5 text-sm font-semibold !text-white"
          >
            Friday Zoom →
          </Link>
          <Link
            href="/pipeline/leads/call-list"
            className="inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-semibold !text-[#0b0c0d]"
          >
            Call List →
          </Link>
        </div>
      </section>
      <div className="theme-light-only flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {leads.length} lead{leads.length === 1 ? "" : "s"} from the marketing site&apos;s gated tools.
        </p>
        <div className="flex items-center gap-4">
          <Link href="/pipeline/leads/friday" className="text-sm font-medium text-primary underline">
            Friday Zoom →
          </Link>
          <Link href="/pipeline/leads/call-list" className="text-sm font-medium text-primary underline">
            Call List →
          </Link>
        </div>
      </div>

      {leads.length === 0 ? (
        <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">No leads yet.</p>
      ) : (
        <LeadsKanbanBoard leads={boardLeads} />
      )}
    </div>
  );
}
