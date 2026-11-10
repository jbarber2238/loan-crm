"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { setEstimatedClosingDate } from "@/server/actions/deals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// The date is stored as the picked calendar day at midnight UTC, so read it back as a UTC day rather than through
// the viewer's time zone (which would show the day before in the Americas).
function dayString(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

function formatDay(day: string): string {
  const [y, m, d] = day.split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
}

/**
 * The Est. Closing value in the deal header: click it to set, change or clear the date without going to the
 * Overview tab. Saves the same field the Overview details form does.
 */
export function EstimatedClosingDate({ dealId, date }: { dealId: string; date: Date | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const saved = dayString(date);
  const [draft, setDraft] = useState(saved);

  function save(value: string | null) {
    startTransition(async () => {
      try {
        await setEstimatedClosingDate(dealId, value);
        toast.success(value ? "Estimated closing date saved" : "Estimated closing date cleared");
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't save — try again.");
      }
    });
  }

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
          aria-label="Edit estimated closing date"
          className="group flex items-center gap-1.5 text-left text-sm font-semibold underline-offset-2 hover:underline"
        >
          {saved ? formatDay(saved) : "—"}
          <Pencil className="size-3 text-muted-foreground opacity-60 group-hover:opacity-100" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`est-closing-${dealId}`}>Estimated closing date</Label>
          <Input id={`est-closing-${dealId}`} type="date" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <p className="text-xs text-muted-foreground">Update it as soon as the lender gives you a better idea.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" disabled={pending || !draft || draft === saved} onClick={() => save(draft)}>
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
