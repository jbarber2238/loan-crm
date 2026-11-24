"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, ListChecks } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { setTaskDone } from "@/server/actions/tasks";
import { isActionError } from "@/lib/action-result";
import { LOAN_CENTER_GOTO_EVENT } from "@/lib/loan-center-events";
import { dueLabel } from "@/lib/tasks";
import { cn } from "@/lib/utils";

export interface DueTask {
  id: string;
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  /** Whose task it is, when it isn't the viewer's own. */
  forName: string | null;
}

const MAX_ROWS = 4;

// Steps aside on the two full-screen conversation tabs (like the deal header) and on the Tasks tab, where the same
// tasks are already listed.
const HIDE_ON = "[html[data-loan-tab=communications]_&]:hidden [html[data-loan-tab=team-chat]_&]:hidden [html[data-loan-tab=tasks]_&]:hidden";

/**
 * Right under the deal header whenever this loan has open tasks that are due today or overdue, so they're seen on
 * opening the loan instead of only inside its Tasks section. Gone once they're done or moved to a later day.
 */
export function DealTasksDueBanner({ dealId, tasks, today }: { dealId: string; tasks: DueTask[]; today: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState<string | null>(null);
  if (tasks.length === 0) return null;

  const overdue = tasks.filter((t) => t.dueDate && t.dueDate < today).length;
  const heading =
    tasks.length === 1
      ? `1 task ${overdue ? "overdue" : "due today"} on this loan`
      : overdue === tasks.length
        ? `${tasks.length} tasks overdue on this loan`
        : overdue
          ? `${tasks.length} tasks due on this loan, ${overdue} overdue`
          : `${tasks.length} tasks due today on this loan`;

  function openTasks() {
    if (pathname === `/deals/${dealId}/loan-center`) window.dispatchEvent(new CustomEvent(LOAN_CENTER_GOTO_EVENT, { detail: { tab: "tasks" } }));
    else router.push(`/deals/${dealId}/loan-center?tab=tasks`);
  }

  async function markDone(task: DueTask) {
    setBusy(task.id);
    try {
      const result = await setTaskDone(task.id, true);
      if (isActionError(result)) toast.error(result.error);
      else toast.success(task.forName ? `Done for ${task.forName}` : "Task marked done");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      aria-label="Tasks due on this loan"
      className={cn("rounded-xl border px-4 py-3", overdue ? "border-destructive/40 bg-destructive/5" : "border-amber-500/40 bg-amber-500/10", HIDE_ON)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <ListChecks className={cn("size-4 shrink-0", overdue ? "text-destructive" : "text-amber-700 dark:text-amber-400")} />
        <h3 className="text-sm font-semibold">{heading}</h3>
        <Button type="button" size="sm" variant="outline" onClick={openTasks} className="ml-auto">
          Open tasks
        </Button>
      </div>
      <ul className="mt-2 grid gap-1.5">
        {tasks.slice(0, MAX_ROWS).map((t) => {
          const due = dueLabel(t.dueDate, t.dueTime, today);
          return (
            <li key={t.id} className={cn("flex items-start gap-2", busy === t.id && "opacity-60")}>
              <button
                type="button"
                aria-label={`Mark done: ${t.title}`}
                title="Mark done"
                disabled={busy === t.id}
                onClick={() => void markDone(t)}
                className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border border-foreground/30 bg-background text-transparent hover:border-primary hover:text-primary focus-visible:text-primary"
              >
                <Check className="size-3.5" />
              </button>
              <p className="min-w-0 flex-1 text-sm break-words">
                {t.title}
                {t.forName && <span className="text-muted-foreground"> · {t.forName}</span>}
              </p>
              <Badge variant={due.tone === "bad" ? "destructive" : "warning"}>{due.text}</Badge>
            </li>
          );
        })}
      </ul>
      {tasks.length > MAX_ROWS && <p className="mt-1.5 text-xs text-muted-foreground">+{tasks.length - MAX_ROWS} more in Tasks</p>}
    </section>
  );
}
