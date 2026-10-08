"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setRateLockExpiration } from "@/server/actions/deals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "cn";

function dayString(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function daysBetween(fromDay: string, toDay: string): number {
  return Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86_400_000);
}

/**
 * The optional "lock expires" line under a locked interest rate: the date if
 * it's known (amber in the last 3 days, red once it has passed), or a small
 * link to add one. Click either to set, change or clear it.
 */
export function RateLockExpiration({ dealId, expiresAt }: { dealId: string; expiresAt: Date | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const saved = dayString(expiresAt);
  const [draft, setDraft] = useState(saved);

  function save(value: string | null) {
    startTransition(async () => {
      try {
        await setRateLockExpiration(dealId, value);
        toast.success(value ? "Lock expiration saved" : "Lock expiration cleared");
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't save — try again.");
      }
    });
  }

  const daysLeft = saved ? daysBetween(localToday(), saved) : null;
  const label = !saved
    ? "Add lock expiration"
    : daysLeft !== null && daysLeft < 0
      ? `Lock expired ${formatDay(saved)}`
      : `Lock expires ${formatDay(saved)}`;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(saved);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "text-left text-[10px] leading-tight underline-offset-2 hover:underline",
            !saved && "text-muted-foreground",
            daysLeft !== null && daysLeft >= 0 && daysLeft <= 3 && "font-medium text-amber-600",
            daysLeft !== null && daysLeft < 0 && "font-medium text-destructive"
          )}
        >
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`lock-expires-${dealId}`}>Rate lock expires</Label>
          <Input id={`lock-expires-${dealId}`} type="date" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <p className="text-xs text-muted-foreground">Optional — fill it in if you know it.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" disabled={pending || !draft} onClick={() => save(draft)}>
            Save
          </Button>
          {saved && (
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => save(null)}>
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function formatDay(day: string): string {
  const [y, m, d] = day.split("-");
  return `${m}/${d}/${y}`;
}
