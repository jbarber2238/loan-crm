"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createTask, deleteTask, setTaskDone } from "@/server/actions/tasks";
import { isActionError } from "@/lib/action-result";
import { dueLabel } from "@/lib/tasks";
import type { TaskRow } from "@/server/tasks";
import { cn } from "@/lib/utils";

export const SELECT_CLS = "h-8 rounded-lg border border-input bg-background px-2 text-sm dark:bg-input/30";

export interface TaskUser {
  id: string;
  name: string;
  role: string;
}

export interface TaskDeal {
  id: string;
  label: string;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** One task: a checkbox, the title, where it is and who it's for, and when it's due. */
export function TaskRowItem({
  task,
  today,
  viewerId,
  isAdmin,
  showDeal,
}: {
  task: TaskRow;
  today: string;
  viewerId: string;
  isAdmin: boolean;
  showDeal: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const done = Boolean(task.completedAt);
  const due = dueLabel(task.dueDate, task.dueTime, today);
  const covering = task.assignedToUserId !== viewerId && !isAdmin;

  const meta: React.ReactNode[] = [];
  if (showDeal) {
    meta.push(
      <Link key="deal" href={`/deals/${task.dealId}/loan-center?tab=tasks`} className="text-primary underline underline-offset-2">
        {task.dealAddress.split(",")[0]}
      </Link>
    );
    meta.push(<span key="borrower">{task.dealBorrower}</span>);
  }
  if (covering) meta.push(<span key="cover">{task.assignedToName}&apos;s task, you&apos;re covering</span>);
  if (task.createdByUserId && task.createdByUserId !== task.assignedToUserId) {
    meta.push(<span key="by">Assigned by {task.createdByUserId === viewerId ? "you" : task.createdByName}</span>);
  }

  function run(action: () => Promise<unknown>, success?: string) {
    startTransition(async () => {
      const result = await action();
      if (isActionError(result)) toast.error(result.error);
      else if (success) toast.success(success);
    });
  }

  return (
    <div className={cn("flex items-start gap-3 border-b px-3 py-2.5 last:border-b-0", pending && "opacity-60")}>
      <input
        type="checkbox"
        checked={done}
        disabled={pending}
        onChange={(e) => run(() => setTaskDone(task.id, e.target.checked), e.target.checked ? (covering ? `Done for ${task.assignedToName}` : "Task marked done") : "Task reopened")}
        aria-label={`Mark done: ${task.title}`}
        className="mt-1 size-4 shrink-0 accent-primary"
      />
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium break-words", done && "text-muted-foreground line-through")}>{task.title}</p>
        {meta.length > 0 && (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            {meta.map((m, i) => (
              <span key={i} className="inline-flex items-center gap-x-1.5">
                {i > 0 && <span aria-hidden>·</span>}
                {m}
              </span>
            ))}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        {done ? <Badge variant="success">Done</Badge> : <Badge variant={due.tone === "bad" ? "destructive" : due.tone === "warn" ? "warning" : "outline"}>{due.text}</Badge>}
        <span title={task.assignedToName} className="grid size-6 place-items-center rounded-full border bg-muted text-[10px] font-bold text-muted-foreground">
          {initials(task.assignedToName)}
        </span>
        <button
          type="button"
          aria-label={`Delete task: ${task.title}`}
          disabled={pending}
          onClick={() => {
            if (window.confirm("Delete this task?")) run(() => deleteTask(task.id), "Task deleted");
          }}
          className="rounded-md p-1 text-muted-foreground opacity-60 hover:bg-muted hover:text-destructive hover:opacity-100 focus-visible:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Title, optional date and time, who it's for. On a deal's own tab the deal is fixed; on the Tasks page it's picked. */
export function AddTaskForm({
  viewerId,
  users,
  deals,
  fixedDealId,
}: {
  viewerId: string;
  users: TaskUser[];
  deals: TaskDeal[];
  fixedDealId?: string;
}) {
  const [title, setTitle] = useState("");
  const [dealId, setDealId] = useState(fixedDealId ?? deals[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [who, setWho] = useState(viewerId);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!title.trim()) {
      toast.error("Give the task a title.");
      return;
    }
    if (!dealId) {
      toast.error("Pick a deal.");
      return;
    }
    startTransition(async () => {
      const result = await createTask({ dealId, title, dueDate: date || null, dueTime: date ? time || null : null, assignedToUserId: who });
      if (isActionError(result)) {
        toast.error(result.error);
        return;
      }
      const other = users.find((u) => u.id === who);
      toast.success(who !== viewerId ? `Assigned to ${other?.name ?? "them"}. It's on their list now, so it won't show on yours.` : date && time ? "Task added. You'll get a pop-up reminder at that time." : "Task added");
      setTitle("");
      setDate("");
      setTime("");
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="What needs to get done?"
          maxLength={200}
          className="min-w-[14rem] flex-1"
        />
        {!fixedDealId && (
          <select aria-label="Deal" value={dealId} onChange={(e) => setDealId(e.target.value)} className={cn(SELECT_CLS, "max-w-[16rem]")}>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        )}
        <Input type="date" aria-label="Due date (optional)" value={date} onChange={(e) => { setDate(e.target.value); if (!e.target.value) setTime(""); }} className="w-auto" />
        <Input type="time" aria-label="Due time (optional)" value={time} disabled={!date} onChange={(e) => setTime(e.target.value)} title={date ? "Optional. A pop-up reminder appears at this time." : "Pick a date first"} className="w-auto" />
        <select aria-label="Assigned to" value={who} onChange={(e) => setWho(e.target.value)} className={SELECT_CLS}>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.id === viewerId ? `Me (${u.name})` : `${u.name} · ${u.role}`}
            </option>
          ))}
        </select>
        <Button type="button" onClick={submit} disabled={pending}>
          {pending ? "Adding…" : "Add task"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Date and time are optional. Add a time and a pop-up reminder appears then.</p>
    </div>
  );
}
