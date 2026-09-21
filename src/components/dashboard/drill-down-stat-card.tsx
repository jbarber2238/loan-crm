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
}: {
  label: string;
  value: string;
  sub?: string;
  deals: T[];
  emptyMessage?: string;
}) {
  const [open, setOpen] = useState(false);
  const clickable = deals.length > 0;

  return (
    <>
      <Card
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
          <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </CardContent>
      </Card>

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
