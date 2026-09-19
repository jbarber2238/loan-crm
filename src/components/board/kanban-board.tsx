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
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { MoreVertical } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LOAN_CATEGORIES, STAGES, labelFor } from "@/lib/labels";
import { STAGES_REQUIRING_REASON, STAGES_REQUIRING_CONFIRMATION, ARCHIVABLE_STAGES } from "@/lib/deal-pipeline";
import { leadValueFor } from "@/lib/term-sheet-calculations";
import { updateDealStage, restoreArchivedDeal } from "@/server/actions/deals";
import { toast } from "sonner";
import { StageReasonDialog } from "@/components/deals/stage-reason-dialog";
import { ClosedConfirmDialog } from "@/components/deals/closed-confirm-dialog";
import { DeleteDealDialog } from "@/components/deals/delete-deal-dialog";
import { ArchiveDealDialog } from "@/components/deals/archive-deal-dialog";

export interface BoardDeal {
  id: string;
  loanNumber: number;
  borrowerName: string;
  propertyAddress: string;
  loanAmountRequested: string;
  approvedLoanAmount: string | null;
  originationPointsOverride: string | null;
  loanCategory: string;
  stage: string;
  createdAt: string;
  currentStageEnteredAt: string;
  processingEnteredAt: string | null;
  assignedLoanOfficerName: string | null;
  assignedProcessorName: string | null;
  lenderName: string | null;
  isArchived: boolean;
}

// Once a deal reaches Processing, hour-level granularity in a stage stops
// being a useful signal — underwriting naturally takes days, not hours.
const DAY_GRANULARITY_STAGES = new Set(["processing", "conditional_approval", "clear_to_close"]);

function daysSince(dateStr: string) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function hoursSince(dateStr: string) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatAmount(amount: string | number) {
  const n = Number(amount);
  if (Number.isNaN(n)) return String(amount);
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

// 2% of the requested amount pre-acceptance, or the deal's real (possibly
// negotiated) origination fee once a term sheet's been accepted — see
// leadValueFor for the full rule. This is what a lead is actually worth to
// close, tracked from intake all the way through to closed or lost.
function dealLeadValue(deal: BoardDeal) {
  return leadValueFor({
    loanAmountRequested: Number(deal.loanAmountRequested),
    approvedLoanAmount: deal.approvedLoanAmount !== null ? Number(deal.approvedLoanAmount) : null,
    originationPointsOverride: deal.originationPointsOverride !== null ? Number(deal.originationPointsOverride) : null,
  });
}

function DealCardMenu({ deal }: { deal: BoardDeal }) {
  const router = useRouter();
  const canArchive = !deal.isArchived && ARCHIVABLE_STAGES.has(deal.stage);

  async function handleUnarchive() {
    try {
      await restoreArchivedDeal(deal.id);
      toast.success("Deal restored to the active pipeline");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't restore this deal.");
    }
  }

  // stopPropagation everywhere here — this sits inside a draggable + a
  // full-card <Link>, and without it a click would either start a drag or
  // navigate into the deal instead of opening the menu/dialog.
  return (
    <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 text-muted-foreground"
            onClick={(e) => e.preventDefault()}
          >
            <MoreVertical className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {deal.isArchived ? (
            <DropdownMenuItem onSelect={handleUnarchive}>Restore to pipeline</DropdownMenuItem>
          ) : (
            canArchive && (
              <ArchiveDealDialog
                dealId={deal.id}
                propertyAddress={deal.propertyAddress}
                trigger={
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>Archive</DropdownMenuItem>
                }
              />
            )
          )}
          <DeleteDealDialog
            dealId={deal.id}
            propertyAddress={deal.propertyAddress}
            trigger={
              <DropdownMenuItem
                variant="destructive"
                onSelect={(e) => e.preventDefault()}
              >
                Delete
              </DropdownMenuItem>
            }
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function DealCard({ deal }: { deal: BoardDeal }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const leadValue = dealLeadValue(deal);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={isDragging ? "opacity-40" : ""}
    >
      <Link href={`/deals/${deal.id}`}>
        <Card className="cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow">
          <CardContent className="p-3 space-y-1.5">
            <div className="flex items-start justify-between gap-1">
              <p className="text-[10px] font-medium text-muted-foreground tracking-wide">
                Loan #{deal.loanNumber}
              </p>
              <DealCardMenu deal={deal} />
            </div>
            {deal.isArchived && (
              <Badge variant="outline" className="text-[10px]">
                Archived
              </Badge>
            )}
            <p className="font-medium text-sm leading-tight">{deal.propertyAddress}</p>
            <p className="text-xs leading-tight">
              <span className="text-muted-foreground">Borrower: </span>
              <span className="font-semibold">{deal.borrowerName}</span>
            </p>
            <div className="text-xs space-y-0.5 pt-0.5">
              <p>
                <span className="text-muted-foreground">{leadValue.basisLabel}: </span>
                <span className="font-semibold">{formatAmount(leadValue.basisAmount)}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Lead Value: </span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                  {formatAmount(leadValue.amount)}
                </span>
              </p>
              <p>
                <span className="text-muted-foreground">Loan Type: </span>
                <span className="font-semibold">{labelFor(LOAN_CATEGORIES, deal.loanCategory)}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Date Submitted: </span>
                <span className="font-semibold">{formatDate(deal.createdAt)}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-1 pt-1">
              {deal.assignedLoanOfficerName && (
                <Badge variant="secondary" className="text-[10px]">
                  LO: {deal.assignedLoanOfficerName}
                </Badge>
              )}
              {deal.assignedProcessorName && (
                <Badge variant="secondary" className="text-[10px]">
                  Proc: {deal.assignedProcessorName}
                </Badge>
              )}
              {deal.lenderName && (
                <Badge variant="outline" className="text-[10px]">
                  {deal.lenderName}
                </Badge>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground pt-0.5 space-y-0.5">
              <p>{daysSince(deal.createdAt)}d since submission</p>
              {DAY_GRANULARITY_STAGES.has(deal.stage) ? (
                <>
                  <p>{daysSince(deal.currentStageEnteredAt)}d in stage</p>
                  {deal.processingEnteredAt && (
                    <p>{daysSince(deal.processingEnteredAt)}d since processing</p>
                  )}
                </>
              ) : (
                <p>{hoursSince(deal.currentStageEnteredAt)}h in stage</p>
              )}
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}

function Column({
  stage,
  label,
  deals,
}: {
  stage: string;
  label: string;
  deals: BoardDeal[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const totalLeadValue = deals.reduce((sum, deal) => sum + dealLeadValue(deal).amount, 0);

  return (
    <div
      ref={setNodeRef}
      className={`flex w-64 shrink-0 flex-col rounded-lg border bg-muted/40 ${
        isOver ? "ring-2 ring-primary" : ""
      }`}
    >
      <div className="flex flex-col gap-0.5 px-3 py-2 border-b bg-background/60 rounded-t-lg">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-muted-foreground">{deals.length}</span>
        </div>
        <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
          Pipeline Stage Value: {formatAmount(totalLeadValue)}
        </span>
      </div>
      <div className="flex flex-col gap-2 p-2 min-h-24 overflow-y-auto max-h-[70vh]">
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} />
        ))}
      </div>
    </div>
  );
}

export function KanbanBoard({ deals }: { deals: BoardDeal[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [localDeals, setLocalDeals] = useState(deals);
  const [syncedDeals, setSyncedDeals] = useState(deals);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingDrop, setPendingDrop] = useState<{ dealId: string; stage: string } | null>(null);
  const [pendingClosedDrop, setPendingClosedDrop] = useState<{ dealId: string; stage: string } | null>(null);

  if (deals !== syncedDeals) {
    setSyncedDeals(deals);
    setLocalDeals(deals);
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const dealsByStage = useMemo(() => {
    const map = new Map<string, BoardDeal[]>();
    for (const stage of STAGES) map.set(stage.value, []);
    for (const deal of localDeals) {
      map.get(deal.stage)?.push(deal);
    }
    return map;
  }, [localDeals]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function commitStageChange(dealId: string, newStage: string, reason?: string, confirmed?: boolean) {
    setLocalDeals((prev) =>
      prev.map((d) =>
        d.id === dealId ? { ...d, stage: newStage, currentStageEnteredAt: new Date().toISOString() } : d
      )
    );

    startTransition(async () => {
      await updateDealStage(dealId, newStage, reason, confirmed);
      router.refresh();
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const dealId = String(active.id);
    const newStage = String(over.id);
    const deal = localDeals.find((d) => d.id === dealId);
    if (!deal || deal.stage === newStage) return;

    // Dropped into On Hold/Follow-up/Lost/Disqualified — don't move the card
    // yet, ask why first. Cancel leaves it exactly where it was.
    if (STAGES_REQUIRING_REASON.has(newStage)) {
      setPendingDrop({ dealId, stage: newStage });
      return;
    }

    // Same "don't move the card yet" treatment as the reason-required
    // stages — closing is the one drop that's expensive to get wrong.
    if (STAGES_REQUIRING_CONFIRMATION.has(newStage)) {
      setPendingClosedDrop({ dealId, stage: newStage });
      return;
    }

    commitStageChange(dealId, newStage);
  }

  const activeDeal = activeId ? localDeals.find((d) => d.id === activeId) : null;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className={`flex gap-3 overflow-x-auto pb-4 ${isPending ? "opacity-70" : ""}`}>
        {STAGES.map((stage) => (
          <Column
            key={stage.value}
            stage={stage.value}
            label={stage.label}
            deals={dealsByStage.get(stage.value) ?? []}
          />
        ))}
      </div>
      <DragOverlay>{activeDeal ? <DealCard deal={activeDeal} /> : null}</DragOverlay>
      {pendingDrop && (
        <StageReasonDialog
          stage={pendingDrop.stage}
          open={!!pendingDrop}
          onOpenChange={(open) => {
            if (!open) setPendingDrop(null);
          }}
          onConfirm={(reason) => {
            commitStageChange(pendingDrop.dealId, pendingDrop.stage, reason);
            setPendingDrop(null);
          }}
        />
      )}
      {pendingClosedDrop && (
        <ClosedConfirmDialog
          open={!!pendingClosedDrop}
          onOpenChange={(open) => {
            if (!open) setPendingClosedDrop(null);
          }}
          onConfirm={() => {
            commitStageChange(pendingClosedDrop.dealId, pendingClosedDrop.stage, undefined, true);
            setPendingClosedDrop(null);
          }}
        />
      )}
    </DndContext>
  );
}
