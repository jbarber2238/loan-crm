import { requireUser } from "@/server/auth/guards";
import { db } from "@/server/db/client";
import { eq } from "drizzle-orm";
import { users } from "@/server/db/schema";
import { getCoverageInfo, listAssignableUsers, listLatestUpdatesForWorkingDeals, listTaskableDeals, listVisibleTasks } from "@/server/tasks";
import { todayEt, type ReminderMode } from "@/lib/tasks";
import { TasksView } from "@/components/tasks/tasks-view";

export const metadata = { title: "Tasks" };

export default async function TasksPage() {
  const user = await requireUser();
  const [tasks, coverage, taskUsers, deals, me, updates] = await Promise.all([
    listVisibleTasks(user),
    getCoverageInfo(user.id),
    listAssignableUsers(),
    listTaskableDeals(),
    db.query.users.findFirst({ where: eq(users.id, user.id), columns: { taskReminderMode: true } }),
    user.isAdmin ? listLatestUpdatesForWorkingDeals() : Promise.resolve(null),
  ]);
  return (
    <TasksView
      tasks={tasks}
      today={todayEt()}
      viewerId={user.id}
      isAdmin={user.isAdmin}
      users={taskUsers}
      deals={deals}
      coverage={coverage}
      reminderMode={(me?.taskReminderMode ?? "now") as ReminderMode}
      updates={updates}
    />
  );
}
