"use client";

import { Card, CardContent } from "@/components/ui/card";
import { compareTasks } from "@/lib/tasks";
import type { TaskRow } from "@/server/tasks";
import { AddTaskForm, TaskRowItem, type TaskUser } from "@/components/tasks/task-parts";
import { TaskVoiceDrafter } from "@/components/tasks/task-voice-drafter";

/** The Tasks tab inside a deal's Loan Center: this deal's tasks (the ones this person may see) and a form to add one. */
export function DealTasksTab({
  dealId,
  tasks,
  today,
  viewerId,
  isAdmin,
  hasCover,
  users,
}: {
  dealId: string;
  tasks: TaskRow[];
  today: string;
  viewerId: string;
  isAdmin: boolean;
  hasCover: boolean;
  users: TaskUser[];
}) {
  const open = tasks.filter((t) => !t.completedAt).sort(compareTasks);
  const done = tasks.filter((t) => t.completedAt);
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-1 pt-6">
          <h3 className="mb-2 text-sm font-semibold">Add a task for this deal</h3>
          <AddTaskForm viewerId={viewerId} users={users} deals={[]} fixedDealId={dealId} />
          <p className="pt-1 text-xs text-muted-foreground">
            {isAdmin ? "You see everyone's tasks on this deal." : `You see your own tasks on this deal${hasCover ? ", plus the tasks of anyone you're covering" : ""}.`}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-1 pt-6">
          <h3 className="mb-2 text-sm font-semibold">Dictate tasks</h3>
          <TaskVoiceDrafter dealId={dealId} viewerId={viewerId} users={users} />
        </CardContent>
      </Card>

      <div className="rounded-xl border bg-card">
        {open.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">No open tasks on this deal.</p>
        ) : (
          open.map((t) => <TaskRowItem key={t.id} task={t} today={today} viewerId={viewerId} isAdmin={isAdmin} showDeal={false} />)
        )}
      </div>

      {done.length > 0 && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b bg-muted/40 px-3 py-2 text-xs font-bold tracking-wider text-muted-foreground uppercase">Completed · {done.length}</div>
          {done.map((t) => (
            <TaskRowItem key={t.id} task={t} today={today} viewerId={viewerId} isAdmin={isAdmin} showDeal={false} />
          ))}
        </div>
      )}
    </div>
  );
}
