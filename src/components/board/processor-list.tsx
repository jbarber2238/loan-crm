"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LOAN_CATEGORIES, STAGES, labelFor } from "@/lib/labels";
import { groupDealsByStage, type PipelineListDeal, type PipelineSort } from "@/lib/pipeline-list";
import { cn } from "@/lib/utils";

// One shared column layout so the header and every row line up. Wide on purpose: it scrolls sideways on a phone.
const COLUMNS = "grid grid-cols-[minmax(170px,1.2fr)_minmax(200px,1.5fr)_110px_100px_minmax(110px,0.8fr)_minmax(110px,0.8fr)_72px_84px_104px_78px_92px] items-center gap-3 px-3";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function daysSince(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function timeAgo(iso: string) {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}h ago`;
  return `${Math.floor(mins / (60 * 24))}d ago`;
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function exact(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

// Same look as the pipeline cards: in dark mode each deal is a white card with dark text and an orange edge on hover.
const MUTED = "text-muted-foreground dark:text-[#605d5b]";

const HEADERS = ["Borrower", "Property", "Loan type", "Amount", "Loan officer", "Processor", "To review", "Conditions", "Est. closing", "In stage", "Last touched"];

const COLLAPSED_BY_DEFAULT = ["on_hold", "lost", "disqualified"];

// The processor's view of the pipeline: one line per deal, grouped by stage. Every row is a real link, so a deal can be
// opened in its own tab (middle-click or Cmd/Ctrl-click) without losing the list.
export function ProcessorList({ deals, sort }: { deals: PipelineListDeal[]; sort: PipelineSort }) {
  const groups = groupDealsByStage(deals, STAGES, sort);
  // Deals that are parked or dead start folded away: they're only opened on purpose, to look one up.
  const [closed, setClosed] = useState<Set<string>>(() => new Set(COLLAPSED_BY_DEFAULT));

  if (groups.length === 0) {
    return <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">No deals match these filters.</p>;
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const isOpen = !closed.has(group.stage);
        return (
          <section key={group.stage} aria-label={group.label} className="rounded-lg border">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() =>
                setClosed((prev) => {
                  const next = new Set(prev);
                  if (isOpen) next.add(group.stage);
                  else next.delete(group.stage);
                  return next;
                })
              }
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
            >
              <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", !isOpen && "-rotate-90")} />
              <span className="text-sm font-semibold">{group.label}</span>
              <span className="text-xs text-muted-foreground">{group.deals.length}</span>
            </button>
            {isOpen && (
              <div className="overflow-x-auto border-t">
                <div className="min-w-[1180px] px-2 pb-2">
                  <div className={cn(COLUMNS, "py-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase")}>
                    {HEADERS.map((h) => (
                      <span key={h}>{h}</span>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {group.deals.map((d) => (
                      <div
                        key={d.id}
                        className={cn(
                          COLUMNS,
                          "deal-card-white group relative rounded-xl border bg-card py-2.5 text-sm transition-shadow",
                          "hover:border-[#fa5f05] hover:shadow-[0_0_0_1px_#fa5f05] focus-within:border-[#fa5f05] focus-within:shadow-[0_0_0_1px_#fa5f05]",
                          "dark:border-[#e2dfdd] dark:bg-white dark:text-[#0b0c0d] dark:hover:border-[#fa5f05] dark:focus-within:border-[#fa5f05]",
                        )}
                      >
                        {/* The whole row opens the deal. It stays a real link (new tab, copy link) and sits under the
                            two count links, which open the deal straight to what the number is counting. */}
                        <Link
                          href={`/deals/${d.id}`}
                          aria-label={`Open ${d.borrowerName}, loan ${d.loanNumber}`}
                          className="absolute inset-0 rounded-xl focus-visible:outline-none"
                        />
                        <span className="pointer-events-none min-w-0">
                          <span className="block truncate font-medium">{d.borrowerName}</span>
                          <span className={cn("block text-xs", MUTED)}>
                            Loan #{d.loanNumber}
                            {d.isArchived ? " · Archived" : ""}
                          </span>
                        </span>
                        <span className="pointer-events-none truncate">{d.propertyAddress}</span>
                        <span className={cn("pointer-events-none truncate", MUTED)}>{labelFor(LOAN_CATEGORIES, d.loanCategory)}</span>
                        <span className="pointer-events-none tabular-nums font-semibold">{money(d.loanAmount)}</span>
                        <span className={cn("pointer-events-none truncate", MUTED)}>{d.assignedLoanOfficerName ?? "—"}</span>
                        <span className={cn("pointer-events-none truncate", MUTED)}>{d.assignedProcessorName ?? "—"}</span>
                        <span className="relative z-10">
                          {d.needsToReview > 0 ? (
                            <Link
                              href={`/deals/${d.id}/loan-center?tab=client-needs&highlight=review`}
                              title="Open the client needs waiting on your review"
                              aria-label={`${d.needsToReview} client needs to review on ${d.borrowerName}`}
                              className="inline-block rounded-full focus-visible:ring-2 focus-visible:ring-[#fa5f05] focus-visible:outline-none"
                            >
                              <Badge variant="warning" className="cursor-pointer hover:brightness-95">{d.needsToReview}</Badge>
                            </Link>
                          ) : (
                            <span className={MUTED}>—</span>
                          )}
                        </span>
                        <span className="relative z-10 tabular-nums">
                          {d.openConditions > 0 ? (
                            <Link
                              href={`/deals/${d.id}/loan-center?tab=conditions`}
                              title="Open the open conditions"
                              aria-label={`${d.openConditions} open conditions on ${d.borrowerName}`}
                              className="inline-block rounded px-1.5 py-0.5 underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-[#fa5f05] focus-visible:outline-none"
                            >
                              {d.openConditions}
                            </Link>
                          ) : (
                            <span className={MUTED}>—</span>
                          )}
                        </span>
                        <span className={cn("pointer-events-none tabular-nums", MUTED)}>{d.estimatedClosingDate ? shortDate(d.estimatedClosingDate) : "—"}</span>
                        <span className={cn("pointer-events-none tabular-nums", MUTED)}>{daysSince(d.currentStageEnteredAt)}d</span>
                        <span className={cn("pointer-events-none", MUTED)} title={exact(d.lastTouchedAt)}>
                          {timeAgo(d.lastTouchedAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
