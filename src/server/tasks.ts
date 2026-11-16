import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, notInArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/server/db/client";
import { dealNotes, dealTasks, deals, notifications, taskCoverage, users } from "@/server/db/schema";
import { pushToUsers } from "@/server/push";
import {
  HEADS_UP_MS,
  LATE_REMINDER_WINDOW_MS,
  coverageActive,
  reminderKind,
  todayEt,
  type ReminderKind,
  type ReminderMode,
} from "@/lib/tasks";

export interface TaskViewer {
  id: string;
  isAdmin: boolean;
}

export interface TaskRow {
  id: string;
  dealId: string;
  dealAddress: string;
  dealBorrower: string;
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  assignedToUserId: string;
  assignedToName: string;
  createdByUserId: string | null;
  createdByName: string | null;
  completedAt: string | null;
}

export interface CoverageInfo {
  /** Who is covering the viewer's tasks right now or in the future (null when nobody is). */
  mine: { coveredByUserId: string; coveredByName: string; startDate: string; endDate: string } | null;
  /** People the viewer is covering today. */
  covering: { userId: string; name: string; endDate: string }[];
}

const assignee = alias(users, "assignee");
const creator = alias(users, "creator");

function userLabel(name: string | null, email: string | null): string {
  return name?.trim() || email || "Someone";
}

/** The people the viewer is covering today (they're out of the office and named the viewer). */
export async function coveredUserIds(viewerId: string, today = todayEt()): Promise<string[]> {
  const rows = await db
    .select({ id: taskCoverage.fromUserId })
    .from(taskCoverage)
    .where(and(eq(taskCoverage.coveredByUserId, viewerId), lte(taskCoverage.startDate, today), gte(taskCoverage.endDate, today)));
  return rows.map((r) => r.id);
}

/** Whose tasks the viewer may see: everyone's for an admin, otherwise their own plus anyone they're covering. */
export async function visibleAssigneeIds(viewer: TaskViewer): Promise<string[] | "all"> {
  if (viewer.isAdmin) return "all";
  return [viewer.id, ...(await coveredUserIds(viewer.id))];
}

/** Whether the viewer may tick off, reopen or delete this task: its owner, whoever is covering them today, or an admin. */
export async function canActOnTask(viewer: TaskViewer, task: { assignedToUserId: string }): Promise<boolean> {
  if (viewer.isAdmin || task.assignedToUserId === viewer.id) return true;
  return (await coveredUserIds(viewer.id)).includes(task.assignedToUserId);
}

function toRow(r: {
  id: string;
  dealId: string;
  address: string;
  borrower: string;
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  assignedToUserId: string;
  assigneeName: string | null;
  assigneeEmail: string | null;
  createdByUserId: string | null;
  creatorName: string | null;
  creatorEmail: string | null;
  completedAt: Date | null;
}): TaskRow {
  return {
    id: r.id,
    dealId: r.dealId,
    dealAddress: r.address,
    dealBorrower: r.borrower,
    title: r.title,
    dueDate: r.dueDate,
    dueTime: r.dueTime,
    assignedToUserId: r.assignedToUserId,
    assignedToName: userLabel(r.assigneeName, r.assigneeEmail),
    createdByUserId: r.createdByUserId,
    createdByName: r.createdByUserId ? userLabel(r.creatorName, r.creatorEmail) : null,
    completedAt: r.completedAt ? r.completedAt.toISOString() : null,
  };
}

/** The tasks this viewer is allowed to see, optionally just those on one deal. Open and completed. */
export async function listVisibleTasks(viewer: TaskViewer, opts: { dealId?: string } = {}): Promise<TaskRow[]> {
  const who = await visibleAssigneeIds(viewer);
  const conditions = [];
  if (who !== "all") conditions.push(inArray(dealTasks.assignedToUserId, who));
  if (opts.dealId) conditions.push(eq(dealTasks.dealId, opts.dealId));
  // Completed tasks only matter for the last couple of months; keeps the list from growing forever.
  conditions.push(or(isNull(dealTasks.completedAt), gte(dealTasks.completedAt, new Date(Date.now() - 60 * 86_400_000))));
  const rows = await db
    .select({
      id: dealTasks.id,
      dealId: dealTasks.dealId,
      address: deals.propertyAddress,
      borrower: deals.borrowerName,
      title: dealTasks.title,
      dueDate: dealTasks.dueDate,
      dueTime: dealTasks.dueTime,
      assignedToUserId: dealTasks.assignedToUserId,
      assigneeName: assignee.name,
      assigneeEmail: assignee.email,
      createdByUserId: dealTasks.createdByUserId,
      creatorName: creator.name,
      creatorEmail: creator.email,
      completedAt: dealTasks.completedAt,
    })
    .from(dealTasks)
    .innerJoin(deals, eq(deals.id, dealTasks.dealId))
    .innerJoin(assignee, eq(assignee.id, dealTasks.assignedToUserId))
    .leftJoin(creator, eq(creator.id, dealTasks.createdByUserId))
    .where(and(...conditions))
    .orderBy(asc(dealTasks.dueDate), asc(dealTasks.dueTime), desc(dealTasks.createdAt));
  return rows.map(toRow);
}

/** How many open tasks are assigned to this person (the badge on the Tasks link). */
export async function countMyOpenTasks(userId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(dealTasks)
    .where(and(eq(dealTasks.assignedToUserId, userId), isNull(dealTasks.completedAt)));
  return rows[0]?.n ?? 0;
}

export async function getCoverageInfo(viewerId: string, today = todayEt()): Promise<CoverageInfo> {
  const [mine, covering] = await Promise.all([
    db
      .select({ by: taskCoverage.coveredByUserId, name: users.name, email: users.email, startDate: taskCoverage.startDate, endDate: taskCoverage.endDate })
      .from(taskCoverage)
      .innerJoin(users, eq(users.id, taskCoverage.coveredByUserId))
      .where(and(eq(taskCoverage.fromUserId, viewerId), gte(taskCoverage.endDate, today)))
      .limit(1),
    db
      .select({ id: taskCoverage.fromUserId, name: users.name, email: users.email, endDate: taskCoverage.endDate, startDate: taskCoverage.startDate })
      .from(taskCoverage)
      .innerJoin(users, eq(users.id, taskCoverage.fromUserId))
      .where(and(eq(taskCoverage.coveredByUserId, viewerId), lte(taskCoverage.startDate, today), gte(taskCoverage.endDate, today))),
  ]);
  return {
    mine: mine[0] ? { coveredByUserId: mine[0].by, coveredByName: userLabel(mine[0].name, mine[0].email), startDate: mine[0].startDate, endDate: mine[0].endDate } : null,
    covering: covering.filter((c) => coverageActive(c, today)).map((c) => ({ userId: c.id, name: userLabel(c.name, c.email), endDate: c.endDate })),
  };
}

/** Everyone who can be given a task. */
export async function listAssignableUsers() {
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, baseRole: users.baseRole, isAdmin: users.isAdmin })
    .from(users)
    .where(eq(users.active, true))
    .orderBy(asc(users.name));
  return rows.map((u) => ({
    id: u.id,
    name: userLabel(u.name, u.email),
    role: u.baseRole === "processor" ? "Processor" : u.baseRole === "loan_officer_assistant" ? "Assistant" : "Loan officer",
  }));
}

/** Deals a task can be put on: anything still being worked (not lost or disqualified), not archived or deleted. */
export async function listTaskableDeals() {
  const rows = await db
    .select({ id: deals.id, address: deals.propertyAddress, borrower: deals.borrowerName })
    .from(deals)
    .where(and(isNull(deals.deletedAt), isNull(deals.archivedAt), notInArray(deals.stage, ["lost", "disqualified"])))
    .orderBy(asc(deals.propertyAddress));
  return rows.map((d) => ({ id: d.id, label: `${d.address.split(",")[0]} · ${d.borrower}` }));
}

// ---- Latest end-of-day update ---------------------------------------------------------------------------

export interface LatestUpdate {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
}

/** The newest end-of-day update on a deal (never a regular, AI or system note), or null if nobody has posted one. */
export async function getLatestUpdate(dealId: string): Promise<LatestUpdate | null> {
  const rows = await db
    .select({ id: dealNotes.id, body: dealNotes.body, createdAt: dealNotes.createdAt, name: users.name, email: users.email })
    .from(dealNotes)
    .leftJoin(users, eq(users.id, dealNotes.authorUserId))
    .where(and(eq(dealNotes.dealId, dealId), eq(dealNotes.isUpdate, true)))
    .orderBy(desc(dealNotes.createdAt))
    .limit(1);
  const r = rows[0];
  return r ? { id: r.id, body: r.body, createdAt: r.createdAt.toISOString(), authorName: userLabel(r.name, r.email) } : null;
}

// Files a processor is actively working: the stages where a daily written update is expected.
const WORKING_STAGES = ["application", "initial_app_review", "underwriting_review", "conditional_approval", "clear_to_close"] as const;

export interface DealUpdateRow {
  dealId: string;
  address: string;
  borrower: string;
  stage: string;
  update: LatestUpdate | null;
}

/** For the admin overview: the latest update on every file being worked, the stalest first (no update at all comes first). */
export async function listLatestUpdatesForWorkingDeals(): Promise<DealUpdateRow[]> {
  const rows = await db
    .select({ id: deals.id, address: deals.propertyAddress, borrower: deals.borrowerName, stage: deals.stage })
    .from(deals)
    .where(and(isNull(deals.deletedAt), isNull(deals.archivedAt), inArray(deals.stage, [...WORKING_STAGES])));
  if (rows.length === 0) return [];
  const notes = await db
    .select({ id: dealNotes.id, dealId: dealNotes.dealId, body: dealNotes.body, createdAt: dealNotes.createdAt, name: users.name, email: users.email })
    .from(dealNotes)
    .leftJoin(users, eq(users.id, dealNotes.authorUserId))
    .where(and(inArray(dealNotes.dealId, rows.map((r) => r.id)), eq(dealNotes.isUpdate, true)))
    .orderBy(desc(dealNotes.createdAt));
  const latest = new Map<string, LatestUpdate>();
  for (const n of notes) {
    if (!latest.has(n.dealId)) latest.set(n.dealId, { id: n.id, body: n.body, createdAt: n.createdAt.toISOString(), authorName: userLabel(n.name, n.email) });
  }
  return rows
    .map((r) => ({ dealId: r.id, address: r.address, borrower: r.borrower, stage: r.stage, update: latest.get(r.id) ?? null }))
    .sort((a, b) => (a.update ? Date.parse(a.update.createdAt) : 0) - (b.update ? Date.parse(b.update.createdAt) : 0));
}

// ---- Reminders ------------------------------------------------------------------------------------------

export interface DueReminder {
  /** Task id plus the kind, so each kind of reminder for a task is its own pop-up. */
  key: string;
  taskId: string;
  kind: ReminderKind;
  title: string;
  dealId: string;
  dealLabel: string;
  dueTime: string;
  dueAtMs: number;
  /** Set when the task belongs to someone the viewer is covering. */
  forName: string | null;
}

/**
 * The pop-up reminders that should be on screen for this person right now: open tasks with a due time that are
 * theirs or belong to someone they're covering, matching their reminder setting. Cheap on purpose; it runs every
 * half minute from each open tab, so it does nothing until a task is actually near.
 */
export async function listDueReminders(viewer: { id: string }, now = new Date()): Promise<DueReminder[]> {
  const horizon = new Date(now.getTime() + HEADS_UP_MS);
  const earliest = new Date(now.getTime() - LATE_REMINDER_WINDOW_MS);
  const today = todayEt(now);
  const rows = await db
    .select({
      id: dealTasks.id,
      title: dealTasks.title,
      dealId: dealTasks.dealId,
      address: deals.propertyAddress,
      borrower: deals.borrowerName,
      dueTime: dealTasks.dueTime,
      dueAt: dealTasks.dueAt,
      assignedToUserId: dealTasks.assignedToUserId,
      assigneeName: assignee.name,
      assigneeEmail: assignee.email,
    })
    .from(dealTasks)
    .innerJoin(deals, eq(deals.id, dealTasks.dealId))
    .innerJoin(assignee, eq(assignee.id, dealTasks.assignedToUserId))
    .where(
      and(
        isNull(dealTasks.completedAt),
        isNotNull(dealTasks.dueAt),
        gte(dealTasks.dueAt, earliest),
        lte(dealTasks.dueAt, horizon),
        or(
          eq(dealTasks.assignedToUserId, viewer.id),
          inArray(
            dealTasks.assignedToUserId,
            db
              .select({ id: taskCoverage.fromUserId })
              .from(taskCoverage)
              .where(and(eq(taskCoverage.coveredByUserId, viewer.id), lte(taskCoverage.startDate, today), gte(taskCoverage.endDate, today)))
          )
        )
      )
    );
  if (rows.length === 0) return [];
  const me = await db.query.users.findFirst({ where: eq(users.id, viewer.id), columns: { taskReminderMode: true } });
  const mode = (me?.taskReminderMode ?? "now") as ReminderMode;
  const out: DueReminder[] = [];
  for (const r of rows) {
    if (!r.dueAt || !r.dueTime) continue;
    const kind = reminderKind(r.dueAt, now, mode);
    if (!kind) continue;
    out.push({
      key: `${r.id}:${kind}`,
      taskId: r.id,
      kind,
      title: r.title,
      dealId: r.dealId,
      dealLabel: `${r.address.split(",")[0]} · ${r.borrower}`,
      dueTime: r.dueTime,
      dueAtMs: r.dueAt.getTime(),
      forName: r.assignedToUserId === viewer.id ? null : userLabel(r.assigneeName, r.assigneeEmail),
    });
  }
  return out.sort((a, b) => a.dueAtMs - b.dueAtMs);
}

/** Phone push for tasks that came due without anyone seeing the on-screen pop-up. Run by the 5-minute cron. */
export async function sendTaskReminderPushes(now = new Date()): Promise<{ due: number; headsUp: number }> {
  const today = todayEt(now);
  let dueCount = 0;
  let headsUpCount = 0;

  async function recipientsFor(assigneeId: string): Promise<{ id: string; mode: ReminderMode }[]> {
    const coverers = await db
      .select({ id: taskCoverage.coveredByUserId })
      .from(taskCoverage)
      .where(and(eq(taskCoverage.fromUserId, assigneeId), lte(taskCoverage.startDate, today), gte(taskCoverage.endDate, today)));
    const ids = [assigneeId, ...coverers.map((c) => c.id)];
    const people = await db.select({ id: users.id, mode: users.taskReminderMode, active: users.active }).from(users).where(inArray(users.id, ids));
    return people.filter((p) => p.active && p.mode !== "off").map((p) => ({ id: p.id, mode: p.mode as ReminderMode }));
  }

  // Due: a minute of grace so an open tab's pop-up (which marks it sent) gets there first.
  const due = await db
    .select({ id: dealTasks.id, title: dealTasks.title, dealId: dealTasks.dealId, assignedToUserId: dealTasks.assignedToUserId, dueTime: dealTasks.dueTime, address: deals.propertyAddress })
    .from(dealTasks)
    .innerJoin(deals, eq(deals.id, dealTasks.dealId))
    .where(
      and(
        isNull(dealTasks.completedAt),
        isNull(dealTasks.dueSentAt),
        isNotNull(dealTasks.dueAt),
        lte(dealTasks.dueAt, new Date(now.getTime() - 60_000)),
        gte(dealTasks.dueAt, new Date(now.getTime() - 30 * 60_000))
      )
    );
  for (const t of due) {
    const claimed = await db.update(dealTasks).set({ dueSentAt: now }).where(and(eq(dealTasks.id, t.id), isNull(dealTasks.dueSentAt))).returning({ id: dealTasks.id });
    if (claimed.length === 0) continue;
    const people = await recipientsFor(t.assignedToUserId);
    if (people.length === 0) continue;
    await pushToUsers(people.map((p) => p.id), {
      title: "Task due now",
      body: `${t.title} · ${t.address.split(",")[0]}`,
      href: `/deals/${t.dealId}/loan-center?tab=tasks`,
      category: "tasks",
      tag: `task-${t.id}`,
    });
    dueCount++;
  }

  const soon = await db
    .select({ id: dealTasks.id, title: dealTasks.title, dealId: dealTasks.dealId, assignedToUserId: dealTasks.assignedToUserId, address: deals.propertyAddress, dueTime: dealTasks.dueTime })
    .from(dealTasks)
    .innerJoin(deals, eq(deals.id, dealTasks.dealId))
    .where(
      and(
        isNull(dealTasks.completedAt),
        isNull(dealTasks.headsUpSentAt),
        isNotNull(dealTasks.dueAt),
        gte(dealTasks.dueAt, new Date(now.getTime() + 60_000)),
        lte(dealTasks.dueAt, new Date(now.getTime() + HEADS_UP_MS))
      )
    );
  for (const t of soon) {
    const claimed = await db.update(dealTasks).set({ headsUpSentAt: now }).where(and(eq(dealTasks.id, t.id), isNull(dealTasks.headsUpSentAt))).returning({ id: dealTasks.id });
    if (claimed.length === 0) continue;
    const people = (await recipientsFor(t.assignedToUserId)).filter((p) => p.mode === "both");
    if (people.length === 0) continue;
    await pushToUsers(people.map((p) => p.id), {
      title: "Task due soon",
      body: `${t.title} · ${t.address.split(",")[0]}`,
      href: `/deals/${t.dealId}/loan-center?tab=tasks`,
      category: "tasks",
      tag: `task-${t.id}`,
    });
    headsUpCount++;
  }
  return { due: dueCount, headsUp: headsUpCount };
}

/** Tells someone a task was given to them by somebody else: a bell notification plus a phone push. Never throws. */
export async function notifyTaskAssigned(input: { toUserId: string; byName: string; title: string; dealId: string; address: string }) {
  try {
    const href = `/deals/${input.dealId}/loan-center?tab=tasks`;
    const title = `${input.byName} gave you a task`;
    const body = `${input.title} · ${input.address.split(",")[0]}`;
    await db.insert(notifications).values({ userId: input.toUserId, dealId: input.dealId, type: "task_assigned", title, body, href });
    await pushToUsers([input.toUserId], { title, body, href, category: "tasks", tag: `task-assigned-${input.dealId}` });
  } catch (err) {
    console.error("Failed to notify task assignee:", err);
  }
}
