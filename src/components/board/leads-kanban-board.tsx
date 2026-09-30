"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LEAD_STATUS_LABELS } from "@/lib/lead-status-labels";
import type { LeadStatus } from "@/lib/lead-scoring";
import { leadDealSummary } from "@/lib/lead-format";
import { updateLeadStatus } from "@/server/actions/leads";
import { toast } from "sonner";

export interface BoardLead {
  id: string;
  name: string;
  phone: string;
  email: string;
  source: string;
  status: LeadStatus;
  lastActivityAt: string;
  lastCalculatorInputs: unknown;
  lastCalculatorResults: unknown;
}

// The natural left-to-right flow of a lead through the funnel — distinct
// from LEAD_STATUS_ORDER (used by badges/call-list, which puts Hot first
// since that's a work-priority ordering, not a pipeline-stage ordering.
const KANBAN_COLUMNS: LeadStatus[] = ["new", "engaged", "hot", "contacted", "nurture", "converted", "dead"];

function hoursSince(dateStr: string) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
}

function LeadCard({ lead }: { lead: BoardLead }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const summary = leadDealSummary(lead.lastCalculatorInputs, lead.lastCalculatorResults);

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={isDragging ? "opacity-40" : ""}>
      <Link href={`/pipeline/leads/${lead.id}`}>
        <Card className="cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow">
          <CardContent className="p-3 space-y-1.5">
            <p className="font-medium text-sm leading-tight">{lead.name}</p>
            <p className="text-xs text-muted-foreground">{lead.source}</p>
            {summary && <p className="text-xs font-medium leading-snug">{summary}</p>}
            <div className="flex flex-wrap gap-1 pt-1">
              <Badge variant="outline" className="text-[10px]">
                {lead.phone}
              </Badge>
            </div>
            <p className="text-[10px] text-muted-foreground pt-0.5">{hoursSince(lead.lastActivityAt)}h since activity</p>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}

function Column({ status, leads }: { status: LeadStatus; leads: BoardLead[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={`flex w-64 shrink-0 flex-col rounded-lg border bg-muted/40 ${isOver ? "ring-2 ring-primary" : ""}`}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b bg-background/60 rounded-t-lg">
        <span className="text-sm font-medium">{LEAD_STATUS_LABELS[status]}</span>
        <span className="text-xs text-muted-foreground">{leads.length}</span>
      </div>
      <div className="flex flex-col gap-2 p-2 min-h-24 overflow-y-auto max-h-[70vh]">
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} />
        ))}
      </div>
    </div>
  );
}

export function LeadsKanbanBoard({ leads }: { leads: BoardLead[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [localLeads, setLocalLeads] = useState(leads);
  const [syncedLeads, setSyncedLeads] = useState(leads);
  const [activeId, setActiveId] = useState<string | null>(null);

  if (leads !== syncedLeads) {
    setSyncedLeads(leads);
    setLocalLeads(leads);
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const leadsByStatus = useMemo(() => {
    const map = new Map<LeadStatus, BoardLead[]>();
    for (const status of KANBAN_COLUMNS) map.set(status, []);
    for (const lead of localLeads) map.get(lead.status)?.push(lead);
    return map;
  }, [localLeads]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const leadId = String(active.id);
    const newStatus = String(over.id) as LeadStatus;
    const lead = localLeads.find((l) => l.id === leadId);
    if (!lead || lead.status === newStatus) return;

    setLocalLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: newStatus } : l)));
    startTransition(async () => {
      try {
        await updateLeadStatus(leadId, newStatus);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't update status.");
        router.refresh();
      }
    });
  }

  const activeLead = activeId ? localLeads.find((l) => l.id === activeId) : null;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className={`flex gap-3 overflow-x-auto pb-4 ${isPending ? "opacity-70" : ""}`}>
        {KANBAN_COLUMNS.map((status) => (
          <Column key={status} status={status} leads={leadsByStatus.get(status) ?? []} />
        ))}
      </div>
      <DragOverlay>{activeLead ? <LeadCard lead={activeLead} /> : null}</DragOverlay>
    </DndContext>
  );
}
