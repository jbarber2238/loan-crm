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
  borrowerName: string | null;
  createdAt: string;
  stageChangedAt: string;
  /** Broker's portion in dollars — the "lead value". */
  leadValue: number;
  totalFee: number;
  totalPoints: number;
}

function daysSince(dateStr: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)));
}

function hoursSince(dateStr: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60)));
}

// Same card menu as the deals board: Archive (Closed/Lost only) and Delete.
// stopPropagation: the menu sits inside a draggable + a full-card link.
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

// Drawn exactly like the deals board's card (kanban-board.tsx DealCard): the white card in the dark
// appearance, the compact card in the light one. Keep the two in step.
function LoanCard({ loan, draggable = true }: { loan: BoardLoan; draggable?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: loan.id, disabled: !draggable });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const heldHours = hoursSince(loan.stageChangedAt);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(draggable ? listeners : {})}
      {...(draggable ? attributes : {})}
      className={isDragging ? "opacity-40" : ""}
    >
      <Link href={`/pipeline/transactional/${loan.id}`}>
        <article className="theme-dark-only deal-card-white cursor-grab rounded-2xl border border-[#e2dfdd] bg-[#ffffff] p-4 text-[#0b0c0d] active:cursor-grabbing hover:border-[#fa5f05]">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs tracking-[0.06em] text-[#605d5b] uppercase [font-family:var(--font-inter-tight),var(--font-inter),sans-serif]">
                Transactional
              </span>
              <LoanCardMenu loan={loan} />
            </div>
            {loan.sameDayFunding && (
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="warning">Same-day funding</Badge>
              </div>
            )}
            <div>
              <h3 className="text-base leading-[22px] font-semibold">{loan.propertyAddress}</h3>
              {loan.borrowerName && <p className="mt-1 text-[13px] text-[#605d5b]">{loan.borrowerName}</p>}
            </div>
            <div className="flex items-end justify-between gap-2">
              <div>
                <div className="text-[11px] tracking-[0.08em] text-[#605d5b] uppercase [font-family:var(--font-inter-tight),var(--font-inter),sans-serif]">
                  Funding
                </div>
                <div className="text-[22px] leading-7 font-bold tabular-nums [font-family:var(--font-inter-tight),var(--font-inter),sans-serif]">
                  {formatMoney(loan.fundingAmount)}
                </div>
              </div>
              <div className="rounded-full bg-[#fff0e6] px-2.5 py-1.5 text-xs font-bold whitespace-nowrap text-[#a33d03] tabular-nums">
                Lead {formatMoney(loan.leadValue)}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[#333f48] px-2.5 py-1 text-xs font-semibold text-white">
                {formatPoints(loan.totalPoints)} total
              </span>
              <span className="text-xs text-[#605d5b]">Closing {formatDay(loan.closingDate)}</span>
            </div>
            <div className="flex flex-wrap justify-between gap-x-2 gap-y-0.5 border-t border-[#ecEAE8] pt-2.5 text-xs text-[#605d5b]">
              <span>{daysSince(loan.createdAt)}d since submission</span>
              <span>{heldHours >= 48 ? `${daysSince(loan.stageChangedAt)}d in stage` : `${heldHours}h in stage`}</span>
            </div>
          </div>
        </article>
        <Card className="theme-light-only cursor-grab transition-shadow hover:shadow-md active:cursor-grabbing">
          <CardContent className="space-y-1.5 p-3">
            <div className="flex items-start justify-between gap-1">
              <p className="text-[10px] font-medium tracking-wide text-muted-foreground">Transactional</p>
              <LoanCardMenu loan={loan} />
            </div>
            {loan.sameDayFunding && (
              <Badge variant="warning" className="text-[10px]">
                Same-day funding
              </Badge>
            )}
            <p className="text-sm leading-tight font-medium">{loan.propertyAddress}</p>
            {loan.borrowerName && (
              <p className="text-xs leading-tight">
                <span className="text-muted-foreground">Borrower: </span>
                <span className="font-semibold">{loan.borrowerName}</span>
              </p>
            )}
            <div className="space-y-0.5 pt-0.5 text-xs">
              <p>
                <span className="text-muted-foreground">Funding: </span>
                <span className="font-semibold">{formatMoney(loan.fundingAmount)}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Lead Value: </span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">{formatMoney(loan.leadValue)}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Total Points: </span>
                <span className="font-semibold">{formatPoints(loan.totalPoints)}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Closing: </span>
                <span className="font-semibold">{formatDay(loan.closingDate)}</span>
              </p>
            </div>
            <div className="space-y-0.5 pt-0.5 text-[10px] text-muted-foreground">
              <p>{daysSince(loan.createdAt)}d since submission</p>
              <p>{heldHours >= 48 ? `${daysSince(loan.stageChangedAt)}d in stage` : `${heldHours}h in stage`}</p>
            </div>
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
      data-col
      className={`flex w-64 shrink-0 flex-col rounded-lg border bg-muted/40 ${isOver ? "ring-2 ring-primary" : ""}`}
    >
      <div className="flex flex-col gap-0.5 rounded-t-lg border-b bg-background/60 px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-xs text-muted-foreground">{loans.length}</span>
        </div>
        <span data-stage-value className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
          Pipeline Stage Value: {formatMoney(total)}
        </span>
      </div>
      <div className="flex max-h-[70vh] min-h-24 flex-col gap-2 overflow-y-auto p-2">
        {loans.length === 0 && (
          <div className="theme-dark-only rounded-[14px] border-[1.5px] border-dashed border-[var(--c-line-strong)] px-3 py-[18px] text-center text-xs text-muted-foreground">
            Drop a request here
          </div>
        )}
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
    <div data-pipeline-banner className="mb-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-3 rounded-xl bg-primary px-4 py-4 text-primary-foreground shadow-sm sm:px-6 sm:py-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary-foreground/70" data-banner-eyebrow>
          Open Transactional Pipeline Value
        </p>
        <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight sm:text-4xl md:text-5xl" data-banner-value>{formatMoney(value)}</p>
      </div>
      <div className="flex gap-8 text-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-primary-foreground/70" data-banner-stat-label>Open requests</p>
          <p className="text-xl font-semibold tabular-nums" data-banner-stat>{open.length}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-primary-foreground/70" data-banner-stat-label>Funding volume</p>
          <p className="text-xl font-semibold tabular-nums" data-banner-stat>{formatMoney(volume)}</p>
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
  const [phoneStage, setPhoneStage] = useState<string>(TRANSACTIONAL_STAGES[0].value);

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
      {/* Phones: one stage at a time, as a plain list of cards (no dragging) — same as the deals board. */}
      <div className={`space-y-3 md:hidden ${isPending ? "opacity-70" : ""}`}>
        <div role="tablist" aria-label="Pipeline stage" className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
          {TRANSACTIONAL_STAGES.map((s) => {
            const count = byStage.get(s.value)?.length ?? 0;
            const on = s.value === phoneStage;
            return (
              <button
                key={s.value}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setPhoneStage(s.value)}
                className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm ${on ? "border-foreground bg-foreground font-medium text-background" : "text-muted-foreground"}`}
              >
                {s.label} ({count})
              </button>
            );
          })}
        </div>
        <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
          Pipeline Stage Value: {formatMoney((byStage.get(phoneStage) ?? []).reduce((sum, l) => sum + l.leadValue, 0))}
        </p>
        <div className="space-y-2">
          {(byStage.get(phoneStage) ?? []).map((loan) => (
            <LoanCard key={loan.id} loan={loan} draggable={false} />
          ))}
          {(byStage.get(phoneStage) ?? []).length === 0 && (
            <p className="rounded-lg border p-4 text-center text-sm text-muted-foreground">No requests in this stage.</p>
          )}
        </div>
      </div>
      <div className={`hidden gap-3 overflow-x-auto pb-4 md:flex ${isPending ? "opacity-70" : ""}`}>
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
