"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ArchiveTransactionalDialog } from "@/components/transactional/archive-transactional-dialog";
import { DeleteTransactionalDialog } from "@/components/transactional/delete-transactional-dialog";
import { ARCHIVABLE_STAGES } from "@/lib/deal-pipeline";
import { Badge } from "@/components/ui/badge";
import { StageReasonDialog } from "@/components/deals/stage-reason-dialog";
import { setTransactionalStage } from "@/server/actions/transactional";
import {
  OPEN_TRANSACTIONAL_STAGES,
  TRANSACTIONAL_STAGES,
  formatDay,
  formatMoney,
} from "@/lib/transactional-shared";
import { formatPoints } from "@/lib/transactional-fees";

export interface BoardLoan {
  id: string;
  propertyAddress: string;
  fundingAmount: number;
  closingDate: string | null;
  stage: string;
  sameDayFunding: boolean;
  /** Broker's portion in dollars — the "lead value". */
  leadValue: number;
  totalFee: number;
  totalPoints: number;
}

// Same card menu as the deals board: Archive (Closed/Lost only) and Delete.
// stopPropagation: the menu sits inside a draggable + a full-card link.
function LoanCardMenu({ loan }: { loan: BoardLoan }) {
  return (
    <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-6 shrink-0 text-muted-foreground" onClick={(e) => e.preventDefault()}>
            <MoreVertical className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {ARCHIVABLE_STAGES.has(loan.stage) && (
            <ArchiveTransactionalDialog
              loanId={loan.id}
              propertyAddress={loan.propertyAddress}
              trigger={<DropdownMenuItem onSelect={(e) => e.preventDefault()}>Archive</DropdownMenuItem>}
            />
          )}
          <DeleteTransactionalDialog
            loanId={loan.id}
            propertyAddress={loan.propertyAddress}
            trigger={
              <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                Delete
              </DropdownMenuItem>
            }
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function LoanCard({ loan }: { loan: BoardLoan }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: loan.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={isDragging ? "opacity-40" : ""}>
      <Link href={`/pipeline/transactional/${loan.id}`}>
        <Card className="cursor-grab transition-shadow hover:shadow-md active:cursor-grabbing">
          <CardContent className="space-y-1.5 p-3">
            <div className="flex items-start justify-between gap-1">
              <p className="text-sm font-medium leading-tight">{loan.propertyAddress}</p>
              <LoanCardMenu loan={loan} />
            </div>
            <p className="text-xs">
              <span className="text-muted-foreground">Funding: </span>
              <span className="font-semibold">{formatMoney(loan.fundingAmount)}</span>
            </p>
            <p className="text-xs">
              <span className="text-muted-foreground">Closing: </span>
              <span className="font-semibold">{formatDay(loan.closingDate)}</span>
            </p>
            <div className="flex flex-wrap items-center gap-1">
              {loan.sameDayFunding && (
                <Badge variant="warning" className="text-[10px]">
                  Same-day
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px]">
                {formatPoints(loan.totalPoints)} total
              </Badge>
            </div>
            <p className="pt-0.5 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              Lead Value: {formatMoney(loan.leadValue)}
            </p>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}

function Column({ stage, label, loans }: { stage: string; label: string; loans: BoardLoan[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const total = loans.reduce((sum, l) => sum + l.leadValue, 0);
  return (
    <div
      ref={setNodeRef}
      className={`flex w-64 shrink-0 snap-start flex-col rounded-lg border bg-muted/40 ${isOver ? "ring-2 ring-primary" : ""}`}
    >
      <div className="flex flex-col gap-0.5 rounded-t-lg border-b bg-background/60 px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-muted-foreground">{loans.length}</span>
        </div>
        <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
          Pipeline Stage Value: {formatMoney(total)}
        </span>
      </div>
      <div className="flex max-h-[70vh] min-h-24 flex-col gap-2 overflow-y-auto p-2">
        {loans.map((loan) => (
          <LoanCard key={loan.id} loan={loan} />
        ))}
      </div>
    </div>
  );
}

// The scoreboard: every request still moving toward a close (New, Sent to
// Lender, Funded). Value is the broker's own portion of the fees.
function OpenValueBanner({ loans }: { loans: BoardLoan[] }) {
  const open = loans.filter((l) => OPEN_TRANSACTIONAL_STAGES.has(l.stage));
  const value = open.reduce((sum, l) => sum + l.leadValue, 0);
  const volume = open.reduce((sum, l) => sum + l.fundingAmount, 0);
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-3 rounded-xl bg-primary px-6 py-5 text-primary-foreground shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary-foreground/70">
          Open Transactional Pipeline Value
        </p>
        <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight md:text-5xl">{formatMoney(value)}</p>
      </div>
      <div className="flex gap-8 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-primary-foreground/70">Open requests</p>
          <p className="text-xl font-semibold tabular-nums">{open.length}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-primary-foreground/70">Funding volume</p>
          <p className="text-xl font-semibold tabular-nums">{formatMoney(volume)}</p>
        </div>
      </div>
      <p className="w-full text-xs text-primary-foreground/60">New through Funded · your portion of the fees</p>
    </div>
  );
}

export function TransactionalBoard({ loans }: { loans: BoardLoan[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [localLoans, setLocalLoans] = useState(loans);
  const [syncedLoans, setSyncedLoans] = useState(loans);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendingLost, setPendingLost] = useState<string | null>(null);

  if (loans !== syncedLoans) {
    setSyncedLoans(loans);
    setLocalLoans(loans);
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const byStage = useMemo(() => {
    const map = new Map<string, BoardLoan[]>();
    for (const s of TRANSACTIONAL_STAGES) map.set(s.value, []);
    for (const loan of localLoans) map.get(loan.stage)?.push(loan);
    return map;
  }, [localLoans]);

  function commit(id: string, stage: string, reason?: string) {
    setLocalLoans((prev) => prev.map((l) => (l.id === id ? { ...l, stage } : l)));
    startTransition(async () => {
      try {
        await setTransactionalStage(id, stage, reason);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't move this request");
      }
      router.refresh();
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const id = String(active.id);
    const stage = String(over.id);
    const loan = localLoans.find((l) => l.id === id);
    if (!loan || loan.stage === stage) return;
    if (stage === "lost") {
      setPendingLost(id);
      return;
    }
    commit(id, stage);
  }

  const activeLoan = activeId ? localLoans.find((l) => l.id === activeId) : null;

  return (
    <DndContext sensors={sensors} onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))} onDragEnd={handleDragEnd}>
      <OpenValueBanner loans={localLoans} />
      <div className={`flex snap-x gap-3 overflow-x-auto pb-4 ${isPending ? "opacity-70" : ""}`}>
        {TRANSACTIONAL_STAGES.map((s) => (
          <Column key={s.value} stage={s.value} label={s.label} loans={byStage.get(s.value) ?? []} />
        ))}
      </div>
      <DragOverlay>{activeLoan ? <LoanCard loan={activeLoan} /> : null}</DragOverlay>
      {pendingLost && (
        <StageReasonDialog
          stage="lost"
          open
          onOpenChange={(open) => {
            if (!open) setPendingLost(null);
          }}
          onConfirm={(reason) => {
            commit(pendingLost, "lost", reason);
            setPendingLost(null);
          }}
        />
      )}
    </DndContext>
  );
}
