"use client";

import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatTime } from "@/lib/tasks";
import { cn } from "@/lib/utils";

/** Every hour and half hour of the day: "00:00", "00:30" … "23:30". */
const SLOTS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);

/** Where the list opens when nothing is picked yet. */
const DEFAULT_SCROLL_TO = "09:00";

/** "10:00am"-style label for the list. */
function label(time: string): string {
  return formatTime(time).replace(" ", "").toLowerCase();
}

/**
 * A due-time field that offers a short list in hour and half-hour steps, instead of the browser's spinning
 * hour/minute/AM-PM columns. Value is "HH:MM" (24-hour) or "" for no time.
 */
export function TimePicker({
  value,
  onChange,
  disabled,
  title,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedRef = useRef<HTMLButtonElement | null>(null);

  // Open with the chosen time (or 9:00 AM) in view.
  useEffect(() => {
    if (open) selectedRef.current?.scrollIntoView({ block: "center" });
  }, [open]);

  const anchor = value || DEFAULT_SCROLL_TO;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        title={title}
        aria-label="Due time (optional)"
        className={cn(
          "inline-flex h-8 min-w-28 items-center justify-between gap-2 rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
          !value && "text-muted-foreground",
        )}
      >
        {value ? label(value) : "Add time"}
        <Clock className="size-3.5 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-36 p-1">
        <div role="listbox" aria-label="Due time" className="max-h-64 overflow-y-auto">
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="w-full rounded-md px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted"
            >
              No time
            </button>
          )}
          {SLOTS.map((slot) => (
            <button
              key={slot}
              ref={slot === anchor ? selectedRef : undefined}
              type="button"
              role="option"
              aria-selected={slot === value}
              onClick={() => {
                onChange(slot);
                setOpen(false);
              }}
              className={cn("w-full rounded-md px-3 py-1.5 text-left text-sm tabular-nums hover:bg-muted", slot === value && "bg-primary/10 font-medium text-primary")}
            >
              {label(slot)}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
