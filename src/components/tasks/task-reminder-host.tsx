"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ListChecks, SquareCheckBig, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { acknowledgeReminder, fetchTaskReminders, setTaskDone } from "@/server/actions/tasks";
import { isActionError } from "@/lib/action-result";
import { useVisibleInterval } from "@/lib/use-visible-interval";
import { LOAN_CENTER_GOTO_EVENT } from "@/lib/loan-center-events";
import { dueCountText, formatTime } from "@/lib/tasks";
import type { DayReminder, DueReminder } from "@/server/tasks";

const POLL_MS = 30_000;
const MAX_SHOWN = 3;
const MAX_DAY_ROWS = 4;
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
 * Pop-up cards on the right of the screen. A task with a due time gets its own card when it's due (or, if chosen,
 * 15 minutes before). Tasks with only a date, and anything overdue, share one "due today" card that shows whenever
 * the CRM is open until it's put away for the day. Separate from the bell: they stay until acted on. Checked every
 * half minute while the tab is on screen. Showing a timed one also tells the server, so its phone push is skipped.
 */
export function TaskReminderHost() {
  const router = useRouter();
  const pathname = usePathname();
  const [reminders, setReminders] = useState<DueReminder[]>([]);
  const [dayReminders, setDayReminders] = useState<DayReminder[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  // What this browser has dismissed or snoozed (key -> hidden until). State, so hiding one re-renders.
  const [memory, setMemory] = useState<Memory>({});
  const memoryRef = useRef<Memory>({});
  const acked = useRef<Set<string>>(new Set());
  // "Now" for deciding what's still snoozed; refreshed on every poll rather than read during render.
  const [now, setNow] = useState(0);

  const poll = useCallback(async () => {
    try {
      const { timed: list, day } = await fetchTaskReminders();
      setNow(Date.now());
      setReminders(list);
      setDayReminders(day);
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

  const hidden = (key: string) => Boolean(memory[key] && memory[key] > now);
  const visible = reminders.filter((r) => !hidden(r.key));
  const dayVisible = dayReminders.filter((r) => !hidden(r.key));
  if (visible.length === 0 && dayVisible.length === 0) return null;
  const shown = visible.slice(0, MAX_SHOWN);
  const dayToday = dayVisible.filter((r) => r.kind === "today").length;
  const dayOverdue = dayVisible.length - dayToday;

  /** Goes to the loan's Tasks section, including when that loan is already open on another section. */
  function openDealTasks(dealId: string) {
    if (pathname === `/deals/${dealId}/loan-center`) window.dispatchEvent(new CustomEvent(LOAN_CENTER_GOTO_EVENT, { detail: { tab: "tasks" } }));
    else router.push(`/deals/${dealId}/loan-center?tab=tasks`);
  }

  function hideDay(untilMs: number) {
    const next = { ...memoryRef.current };
    for (const r of dayVisible) next[r.key] = untilMs;
    memoryRef.current = next;
    save(next);
    setMemory(next);
    setNow(Date.now());
  }

  async function markDone(taskId: string, forName: string | null) {
    setBusy(taskId);
    try {
      const result = await setTaskDone(taskId, true);
      if (isActionError(result)) {
        toast.error(result.error);
        return false;
      }
      toast.success(forName ? `Done for ${forName}` : "Task marked done");
      void poll();
      router.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  }

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
                openDealTasks(r.dealId);
              }}
            >
              Open task
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy === r.taskId}
              onClick={async () => {
                if (await markDone(r.taskId, r.forName)) dismiss(r.key);
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
      {dayVisible.length > 0 && (
        <div role="group" aria-label="Tasks due today and overdue" className="pointer-events-auto grid gap-2 rounded-xl border bg-card p-3 shadow-2xl animate-in fade-in slide-in-from-right-6">
          <div className="flex items-center gap-2">
            <span className={`grid size-6 place-items-center rounded-md ${dayOverdue ? "bg-destructive/10 text-destructive" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"}`}>
              <ListChecks className="size-3.5" />
            </span>
            <p className="text-sm font-semibold">{dueCountText(dayToday, dayOverdue)}</p>
            <button type="button" aria-label="Put away until tomorrow" title="Put away until tomorrow" onClick={() => hideDay(Date.now() + 24 * 3600_000)} className="ml-auto rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
              <X className="size-3.5" />
            </button>
          </div>
          <ul className="grid gap-1">
            {dayVisible.slice(0, MAX_DAY_ROWS).map((r) => (
              <li key={r.key} className="flex items-start gap-2">
                <button
                  type="button"
                  aria-label={`Mark done: ${r.title}`}
                  title="Mark done"
                  disabled={busy === r.taskId}
                  onClick={() => void markDone(r.taskId, r.forName)}
                  className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border text-transparent hover:border-primary hover:text-primary focus-visible:text-primary disabled:opacity-50"
                >
                  <Check className="size-3.5" />
                </button>
                <button type="button" onClick={() => openDealTasks(r.dealId)} className="min-w-0 flex-1 text-left">
                  <span className="block text-sm font-medium break-words hover:underline">{r.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {r.dealLabel}
                    {r.forName ? ` · Covering for ${r.forName}` : ""}
                  </span>
                </button>
                {r.kind === "overdue" ? <Badge variant="destructive">{r.daysLate}d late</Badge> : <Badge variant="warning">Today</Badge>}
              </li>
            ))}
          </ul>
          {dayVisible.length > MAX_DAY_ROWS && <p className="text-xs text-muted-foreground">+{dayVisible.length - MAX_DAY_ROWS} more on your task list</p>}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button type="button" size="sm" onClick={() => router.push("/tasks")}>
              Open my tasks
            </Button>
            <select
              aria-label="Remind me again later"
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                const { until, label } = snoozeUntil(e.target.value);
                hideDay(until);
                toast.success(`Put away. We'll remind you again ${label}.`);
              }}
              className="h-7 rounded-lg border border-input bg-background px-2 text-xs dark:bg-input/30"
            >
              <option value="">Remind me later…</option>
              <option value="60">In 1 hour</option>
              <option value="180">In 3 hours</option>
              <option value="tomorrow">Tomorrow, 9 AM</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
