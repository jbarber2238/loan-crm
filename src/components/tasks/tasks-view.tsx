"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { endCoverage, setCoverage, setTaskReminderMode } from "@/server/actions/tasks";
import { isActionError } from "@/lib/action-result";
import { BUCKET_LABEL, BUCKET_ORDER, compareTasks, dueBucket, formatDay, updateAgeChip, updateAgeDays, type AgeTone, type ReminderMode } from "@/lib/tasks";
import type { CoverageInfo, DealUpdateRow, TaskRow } from "@/server/tasks";
import { AddTaskForm, SELECT_CLS, TaskRowItem, type TaskDeal, type TaskUser } from "@/components/tasks/task-parts";
import { cn } from "@/lib/utils";

const TONE_VARIANT: Record<AgeTone, "success" | "outline" | "warning" | "destructive"> = { ok: "success", muted: "outline", warn: "warning", bad: "destructive" };

type Scope = "mine" | "cover" | "everyone";

export function TasksView({
  tasks,
  today,
  viewerId,
  isAdmin,
  users,
  deals,
  coverage,
  reminderMode,
  updates,
}: {
  tasks: TaskRow[];
  today: string;
  viewerId: string;
  isAdmin: boolean;
  users: TaskUser[];
  deals: TaskDeal[];
  coverage: CoverageInfo;
  reminderMode: ReminderMode;
  /** Admins only: the latest end-of-day update on every file being worked. */
  updates: DealUpdateRow[] | null;
}) {
  const [section, setSection] = useState<"tasks" | "updates">("tasks");
  const [scope, setScope] = useState<Scope>("mine");
  const [dealFilter, setDealFilter] = useState("all");
  const [personFilter, setPersonFilter] = useState("all");
  const [showDone, setShowDone] = useState(false);
  const [panel, setPanel] = useState<null | "cover" | "remind">(null);

  const coveredIds = new Set(coverage.covering.map((c) => c.userId));
  const activeScope: Scope = scope === "cover" && coveredIds.size === 0 ? "mine" : scope === "everyone" && !isAdmin ? "mine" : scope;

  const mine = tasks.filter((t) => t.assignedToUserId === viewerId);
  const openMine = mine.filter((t) => !t.completedAt);
  const overdue = openMine.filter((t) => t.dueDate && t.dueDate < today).length;
  const dueToday = openMine.filter((t) => t.dueDate === today).length;
  const coverOpen = tasks.filter((t) => !t.completedAt && coveredIds.has(t.assignedToUserId)).length;

  const scoped = tasks.filter((t) => (activeScope === "everyone" ? true : activeScope === "cover" ? coveredIds.has(t.assignedToUserId) : t.assignedToUserId === viewerId));
  const shown = scoped.filter((t) => {
    if (showDone ? !t.completedAt : t.completedAt) return false;
    if (dealFilter !== "all" && t.dealId !== dealFilter) return false;
    if (activeScope === "everyone" && personFilter !== "all" && t.assignedToUserId !== personFilter) return false;
    return true;
  });

  const dealsWithTasks = [...new Map(tasks.map((t) => [t.dealId, t.dealAddress.split(",")[0]])).entries()];

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{section === "updates" ? "Deal updates" : "Tasks"}</h1>
          <p className="text-sm text-muted-foreground">
            {section === "updates" ? "The latest end-of-day update on every file being worked, the stalest first." : isAdmin ? "Everything you and the team need to do, across all deals." : "Your tasks across all deals."}
          </p>
        </div>
        {section === "tasks" && (
          <div className="flex flex-wrap gap-2">
            <Stat label="Overdue" value={overdue} bad />
            <Stat label="Due today" value={dueToday} />
            <Stat label="Open (mine)" value={openMine.length} />
          </div>
        )}
      </div>

      {isAdmin && updates && (
        <div className="flex gap-1 border-b">
          {(
            [
              ["tasks", "Tasks"],
              ["updates", "Deal updates"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={cn("-mb-px border-b-2 px-3 py-2 text-sm", section === id ? "border-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {section === "updates" && updates ? (
        <UpdatesList rows={updates} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              {coverage.mine && (
                <Badge variant="outline">
                  Covered by {coverage.mine.coveredByName} · {formatDay(coverage.mine.startDate, { weekday: true })} to {formatDay(coverage.mine.endDate, { weekday: true })}
                </Badge>
              )}
              {coverage.covering.map((c) => (
                <Badge key={c.userId} variant="outline">
                  You&apos;re covering for {c.name} through {formatDay(c.endDate, { weekday: true })}
                </Badge>
              ))}
              {!coverage.mine && coverage.covering.length === 0 && <span>Not out of the office. Reminders: {reminderMode === "off" ? "off" : "on"}.</span>}
            </div>
            <div className="flex gap-1.5">
              <Button type="button" size="sm" variant="outline" onClick={() => setPanel(panel === "cover" ? null : "cover")}>
                Out of office
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setPanel(panel === "remind" ? null : "remind")}>
                Reminders
              </Button>
            </div>
          </div>

          {panel === "cover" && <CoveragePanel users={users.filter((u) => u.id !== viewerId)} coverage={coverage} onDone={() => setPanel(null)} today={today} />}
          {panel === "remind" && <ReminderPanel mode={reminderMode} />}

          <Card>
            <CardContent className="space-y-1 pt-6">
              <h3 className="mb-2 text-sm font-semibold">Add a task</h3>
              <AddTaskForm viewerId={viewerId} users={users} deals={deals} />
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              value={activeScope}
              onChange={(v) => {
                setScope(v as Scope);
                setPersonFilter("all");
              }}
              options={[
                ["mine", "My tasks"],
                ...(coveredIds.size > 0 ? ([["cover", `Covering for ${coverage.covering.map((c) => c.name).join(", ")} (${coverOpen})`]] as [string, string][]) : []),
                ...(isAdmin ? ([["everyone", "Everyone's tasks"]] as [string, string][]) : []),
              ]}
            />
            <select aria-label="Filter by deal" value={dealFilter} onChange={(e) => setDealFilter(e.target.value)} className={SELECT_CLS}>
              <option value="all">All deals</option>
              {dealsWithTasks.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            {activeScope === "everyone" && (
              <select aria-label="Filter by person" value={personFilter} onChange={(e) => setPersonFilter(e.target.value)} className={SELECT_CLS}>
                <option value="all">Everyone</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            )}
            <Segmented
              value={showDone ? "done" : "open"}
              onChange={(v) => setShowDone(v === "done")}
              options={[
                ["open", "Open"],
                ["done", "Completed"],
              ]}
            />
          </div>

          {showDone ? (
            <div className="overflow-hidden rounded-xl border bg-card">
              {shown.length ? (
                shown.map((t) => <TaskRowItem key={t.id} task={t} today={today} viewerId={viewerId} isAdmin={isAdmin} showDeal />)
              ) : (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing completed yet.</p>
              )}
            </div>
          ) : shown.length === 0 ? (
            <div className="rounded-xl border bg-card px-3 py-6 text-center text-sm text-muted-foreground">
              {activeScope === "cover" ? "Nothing open on the tasks you're covering." : "You're all caught up. Nothing open."}
            </div>
          ) : (
            BUCKET_ORDER.map((bucket) => {
              const items = shown.filter((t) => dueBucket(t.dueDate, today) === bucket).sort(compareTasks);
              if (items.length === 0) return null;
              return (
                <div key={bucket} className="overflow-hidden rounded-xl border bg-card">
                  <div className={cn("flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-bold tracking-wider uppercase", bucket === "overdue" ? "text-destructive" : "text-muted-foreground")}>
                    {BUCKET_LABEL[bucket]} <span className="font-semibold tracking-normal">{items.length}</span>
                  </div>
                  {items.map((t) => (
                    <TaskRowItem key={t.id} task={t} today={today} viewerId={viewerId} isAdmin={isAdmin} showDeal />
                  ))}
                </div>
              );
            })
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value, bad }: { label: string; value: number; bad?: boolean }) {
  return (
    <div className="min-w-[5.5rem] rounded-xl border bg-card px-3.5 py-1.5">
      <b className={cn("block text-lg leading-tight font-semibold tabular-nums", bad && value > 0 && "text-destructive")}>{value}</b>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="inline-flex flex-wrap rounded-lg border bg-muted/50 p-0.5">
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          aria-pressed={value === id}
          onClick={() => onChange(id)}
          className={cn("rounded-md px-2.5 py-1 text-sm", value === id ? "bg-background font-semibold shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function CoveragePanel({ users, coverage, onDone, today }: { users: TaskUser[]; coverage: CoverageInfo; onDone: () => void; today: string }) {
  const [who, setWho] = useState(coverage.mine?.coveredByUserId ?? users[0]?.id ?? "");
  const [start, setStart] = useState(coverage.mine?.startDate ?? today);
  const [end, setEnd] = useState(coverage.mine?.endDate ?? "");
  const [pending, startTransition] = useTransition();

  function save() {
    if (!end) {
      toast.error("Pick the day you're back so coverage ends on its own.");
      return;
    }
    startTransition(async () => {
      const result = await setCoverage({ coveredByUserId: who, startDate: start, endDate: end });
      if (isActionError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(`${users.find((u) => u.id === who)?.name ?? "They"} now cover your tasks through ${formatDay(end, { weekday: true })}.`);
      onDone();
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <h3 className="text-sm font-semibold">Out of office</h3>
        <p className="text-xs text-muted-foreground">
          Pick who covers your tasks while you&apos;re away. They get a &ldquo;Covering for you&rdquo; view of your open tasks and can complete them. The tasks stay yours, and they also get the pop-up reminders for tasks with a time. Coverage ends by itself on the last day.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
            Covered by
            <select value={who} onChange={(e) => setWho(e.target.value)} className={SELECT_CLS}>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.role}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
            First day away
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-auto" />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
            Back on
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="w-auto" />
          </label>
          <Button type="button" onClick={save} disabled={pending || !who}>
            Set coverage
          </Button>
          {coverage.mine && (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await endCoverage();
                  if (isActionError(result)) toast.error(result.error);
                  else {
                    toast.success("Coverage ended. Your tasks are only yours again.");
                    onDone();
                  }
                })
              }
            >
              End coverage now
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ReminderPanel({ mode }: { mode: ReminderMode }) {
  const [value, setValue] = useState<ReminderMode>(mode);
  const [pending, startTransition] = useTransition();

  function choose(next: ReminderMode) {
    const previous = value;
    setValue(next);
    startTransition(async () => {
      const result = await setTaskReminderMode(next);
      if (isActionError(result)) {
        setValue(previous);
        toast.error(result.error);
      } else toast.success("Saved");
    });
  }

  const options: [ReminderMode, string][] = [
    ["now", "At the due time"],
    ["both", "15 minutes before, and again at the due time"],
    ["off", "No pop-ups"],
  ];
  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <h3 className="text-sm font-semibold">Task reminders</h3>
        <p className="text-xs text-muted-foreground">Applies to tasks that have a due time. They appear as a pop-up card on the right of the screen, separate from the bell.</p>
        <div role="radiogroup" aria-label="When to remind me" className="grid gap-1.5">
          {options.map(([id, label]) => (
            <label key={id} className="flex items-start gap-2 text-sm">
              <input type="radio" name="reminder-mode" checked={value === id} disabled={pending} onChange={() => choose(id)} className="mt-1 accent-primary" />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Phone alerts for these reminders (when the CRM isn&apos;t open on screen) are switched on or off under{" "}
          <Link href="/settings/notifications" className="text-primary underline underline-offset-2">
            notification settings
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}

function UpdatesList({ rows }: { rows: DealUpdateRow[] }) {
  if (rows.length === 0) return <div className="rounded-xl border bg-card px-3 py-6 text-center text-sm text-muted-foreground">No files are being worked right now.</div>;
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {rows.map((r) => {
        const age = r.update ? updateAgeDays(new Date(r.update.createdAt)) : null;
        const chip = age === null ? null : updateAgeChip(age);
        const snippet = r.update ? (r.update.body.split("\n").filter((l) => l.trim() && !/^[A-Z &’']+:\s*$/.test(l.trim()))[0] ?? "") : "";
        return (
          <Link key={r.dealId} href={`/deals/${r.dealId}/loan-center?tab=notes`} className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-3.5 py-3 last:border-b-0 hover:bg-muted/50">
            <div className="min-w-[12rem] flex-1">
              <p className="text-sm font-semibold">{r.address.split(",")[0]}</p>
              <p className="text-xs text-muted-foreground">
                {r.borrower}
                {r.update ? ` · ${r.update.authorName}` : ""}
              </p>
            </div>
            <p className="line-clamp-2 min-w-[12rem] flex-[2] text-sm text-muted-foreground">{snippet || "Nothing written yet."}</p>
            {chip ? <Badge variant={TONE_VARIANT[chip.tone]}>{chip.text}</Badge> : <Badge variant="destructive">No update</Badge>}
          </Link>
        );
      })}
    </div>
  );
}
