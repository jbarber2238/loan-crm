"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SquareCheckBig, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { acknowledgeReminder, fetchDueReminders, setTaskDone } from "@/server/actions/tasks";
import { isActionError } from "@/lib/action-result";
import { useVisibleInterval } from "@/lib/use-visible-interval";
import { formatTime } from "@/lib/tasks";
import type { DueReminder } from "@/server/tasks";

const POLL_MS = 30_000;
const MAX_SHOWN = 3;
const STORE_KEY = "crm.task-reminders.v1";

/** Reminders this browser has dismissed or snoozed, remembered so a refresh doesn't bring them back. */
type Memory = Record<string, number>; // key -> hidden until (ms); Infinity-like for dismissed

function load(): Memory {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Memory;
    const now = Date.now();
    // Dismissed ones are kept for a day (long enough that the task has moved on), snoozed until they're due again.
    return Object.fromEntries(Object.entries(raw).filter(([, until]) => until > now));
  } catch {
    return {};
  }
}

function save(memory: Memory) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(memory));
  } catch {
    // Storage blocked: pop-ups just come back after a refresh.
  }
}

function dayFromNow(): { until: number; now: number } {
  const now = Date.now();
  return { until: now + 24 * 3600_000, now };
}

function snoozeUntil(choice: string): { until: number; label: string; now: number } {
  if (choice === "tomorrow") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return { until: d.getTime(), label: "tomorrow at 9:00 AM", now: Date.now() };
  }
  const until = Date.now() + Number(choice) * 60_000;
  return { until, now: Date.now(), label: `at ${new Date(until).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` };
}

/**
 * Pop-up cards on the right of the screen when a task with a due time is due (or, if chosen, 15 minutes before).
 * Separate from the bell: they stay until acted on. Open task, mark done, snooze or dismiss. Checked every half
 * minute while the tab is on screen. Showing one also tells the server, so the phone push for it is skipped.
 */
export function TaskReminderHost() {
  const router = useRouter();
  const [reminders, setReminders] = useState<DueReminder[]>([]);
  // What this browser has dismissed or snoozed (key -> hidden until). State, so hiding one re-renders.
  const [memory, setMemory] = useState<Memory>({});
  const memoryRef = useRef<Memory>({});
  const acked = useRef<Set<string>>(new Set());
  // "Now" for deciding what's still snoozed; refreshed on every poll rather than read during render.
  const [now, setNow] = useState(0);

  const poll = useCallback(async () => {
    try {
      const list = await fetchDueReminders();
      setNow(Date.now());
      setReminders(list);
      for (const r of list) {
        if (memoryRef.current[r.key] && memoryRef.current[r.key] > Date.now()) continue;
        if (acked.current.has(r.key)) continue;
        acked.current.add(r.key);
        void acknowledgeReminder(r.taskId, r.kind).catch(() => acked.current.delete(r.key));
      }
    } catch {
      // Offline or signed out: try again next time.
    }
  }, []);

  useEffect(() => {
    memoryRef.current = load();
    setMemory(memoryRef.current);
    void poll();
  }, [poll]);
  useVisibleInterval(() => void poll(), POLL_MS);

  function hide(key: string, untilMs: number) {
    memoryRef.current = { ...memoryRef.current, [key]: untilMs };
    save(memoryRef.current);
    setMemory(memoryRef.current);
  }

  function dismiss(key: string) {
    const at = dayFromNow();
    hide(key, at.until);
    setNow(at.now);
  }

  const visible = reminders.filter((r) => !(memory[r.key] && memory[r.key] > now));
  if (visible.length === 0) return null;
  const shown = visible.slice(0, MAX_SHOWN);

  function snooze(r: DueReminder, choice: string) {
    const { until, label, now: at } = snoozeUntil(choice);
    hide(r.key, until);
    setNow(at);
    toast.success(`Snoozed. We'll remind you again ${label}.`);
  }

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[60] grid gap-2.5 max-sm:top-[max(0.75rem,env(safe-area-inset-top))] max-sm:bottom-auto sm:inset-x-auto sm:right-4 sm:w-[372px]"
    >
      {shown.map((r) => (
        <div key={r.key} role="group" aria-label="Task reminder" className="pointer-events-auto grid gap-2 rounded-xl border bg-card p-3 shadow-2xl animate-in fade-in slide-in-from-right-6">
          <div className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-md bg-primary/10 text-primary">
              <SquareCheckBig className="size-3.5" />
            </span>
            {r.kind === "soon" ? <Badge variant="warning">Due in 15 minutes</Badge> : r.kind === "late" ? <Badge variant="destructive">Was due</Badge> : <Badge variant="destructive">Due now</Badge>}
            <span className="text-xs text-muted-foreground">{formatTime(r.dueTime)}</span>
            <button type="button" aria-label="Dismiss reminder" onClick={() => dismiss(r.key)} className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="size-3.5" />
            </button>
          </div>
          <div>
            <p className="text-sm font-semibold break-words">{r.title}</p>
            <p className="text-xs text-muted-foreground">
              {r.dealLabel}
              {r.forName ? ` · You're covering for ${r.forName}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                dismiss(r.key);
                router.push(`/deals/${r.dealId}/loan-center?tab=tasks`);
              }}
            >
              Open task
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={async () => {
                const result = await setTaskDone(r.taskId, true);
                if (isActionError(result)) {
                  toast.error(result.error);
                  return;
                }
                dismiss(r.key);
                toast.success(r.forName ? `Done for ${r.forName}` : "Task marked done");
                void poll();
                router.refresh();
              }}
            >
              Mark done
            </Button>
            <select
              aria-label="Snooze this reminder"
              value=""
              onChange={(e) => e.target.value && snooze(r, e.target.value)}
              className="h-7 rounded-lg border border-input bg-background px-2 text-xs dark:bg-input/30"
            >
              <option value="">Snooze…</option>
              <option value="10">10 minutes</option>
              <option value="60">1 hour</option>
              <option value="tomorrow">Tomorrow, 9 AM</option>
            </select>
          </div>
        </div>
      ))}
      {visible.length > MAX_SHOWN && (
        <div className="pointer-events-auto justify-self-end rounded-full border bg-card px-3 py-0.5 text-xs text-muted-foreground">+{visible.length - MAX_SHOWN} more reminders</div>
      )}
    </div>
  );
}
