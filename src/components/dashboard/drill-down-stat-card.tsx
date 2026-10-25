"use client";

import { useState } from "react";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { STAGES, labelFor } from "@/lib/labels";
import type { DrillDownDeal } from "@/server/dashboard-metrics";

/**
 * Same look as a plain stat card, but the number is a button: click it and
 * see exactly which deals are being counted, not just trust the total.
 * Every Pipeline & Conversion figure is built from real deal data, so this
 * is always available — no separate "why is this number X" investigation
 * needed, the answer is one click away.
 */
export function DrillDownStatCard<T extends DrillDownDeal & { viaRestore?: boolean }>({
  label,
  value,
  sub,
  deals,
  emptyMessage = "No deals behind this number in this range.",
  compact = false,
  tile = false,
  pill,
  featured = false,
}: {
  label: string;
  value: string;
  sub?: string;
  deals: T[];
  emptyMessage?: string;
  /** Smaller card for tight layouts (e.g. beside the payout widget). */
  compact?: boolean;
  /** The dark dashboard's tile look: label, big figure, caption. */
  tile?: boolean;
  /** Small chip beside the label (e.g. "5 open"). */
  pill?: string;
  /** Orange-tinted background for the one figure worth a second look. */
  featured?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const clickable = deals.length > 0;

  const clickProps = {
    role: clickable ? "button" : undefined,
    tabIndex: clickable ? 0 : undefined,
    onClick: clickable ? () => setOpen(true) : undefined,
    onKeyDown: clickable
      ? (e: React.KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }
      : undefined,
  };

  return (
    <>
      {tile ? (
        <div
          {...clickProps}
          className={`flex flex-col gap-1.5 rounded-[22px] border border-[rgba(246,246,246,.08)] p-[20px_22px] ${
            featured
              ? "bg-[linear-gradient(160deg,rgba(250,95,5,.12),rgba(250,95,5,0)_50%),#121315]"
              : "bg-[#121315]"
          } ${clickable ? "cursor-pointer transition-colors hover:border-[#fdb78f]/60" : ""}`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-[rgba(246,246,246,.78)]">{label}</span>
            {pill && (
              <span className="rounded-full bg-[rgba(250,95,5,.16)] px-2.5 py-[3px] text-xs font-semibold text-[#fdb78f]">{pill}</span>
            )}
          </div>
          <span className="text-[34px] leading-10 font-bold tracking-[-0.015em] [font-family:var(--font-inter-tight),var(--font-inter),sans-serif]">
            {value}
          </span>
          {sub && <span className="text-[13px] text-[rgba(246,246,246,.72)]">{sub}</span>}
        </div>
      ) : (
      <Card
        size={compact ? "sm" : "default"}
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={clickable ? () => setOpen(true) : undefined}
        onKeyDown={
          clickable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen(true);
                }
              }
            : undefined
        }
        className={clickable ? "cursor-pointer transition-colors hover:bg-muted/50" : undefined}
      >
        <CardHeader className="pb-2">
          <CardTitle className={compact ? "text-xs font-medium text-muted-foreground" : "text-sm font-medium text-muted-foreground"}>{label}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className={compact ? "text-xl font-bold" : "text-2xl font-bold"}>{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </CardContent>
      </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 space-y-1.5 overflow-y-auto">
            {deals.length === 0 && <p className="text-sm text-muted-foreground">{emptyMessage}</p>}
            {deals.map((d) => (
              <Link key={d.id} href={`/deals/${d.id}`} className="block rounded-md border px-3 py-2 text-sm hover:bg-muted">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {d.loanNumber ? `#${d.loanNumber} — ` : ""}
                    {d.borrowerName}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{labelFor(STAGES, d.stage)}</span>
                </div>
                <p className="truncate text-xs text-muted-foreground">{d.propertyAddress}</p>
                {d.viaRestore !== undefined && (
                  <p className="text-xs text-muted-foreground">{d.viaRestore ? "Restored lead" : "Direct"}</p>
                )}
              </Link>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
