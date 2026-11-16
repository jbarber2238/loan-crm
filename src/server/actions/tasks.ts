"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { dealTasks, deals, taskCoverage, users } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { fail, type ActionError } from "@/lib/action-result";
import {
  MAX_TASK_TITLE,
  REMINDER_MODES,
  dueAtFrom,
  isDateString,
  isTimeString,
  todayEt,
  type ReminderMode,
} from "@/lib/tasks";
import { canActOnTask, listDueReminders, notifyTaskAssigned, type DueReminder } from "@/server/tasks";

type Ok = { ok: true };

function refresh(dealId?: string) {
  // The layout too: the sidebar's open-task count lives in it.
  revalidatePath("/", "layout");
  revalidatePath("/tasks");
  if (dealId) revalidatePath(`/deals/${dealId}/loan-center`);
}

export interface NewTaskInput {
  dealId: string;
  title: string;
  dueDate?: string | null;
  dueTime?: string | null;
  assignedToUserId?: string | null;
}

export async function createTask(input: NewTaskInput): Promise<Ok | ActionError> {
  const user = await requireUser();
  const title = (input.title ?? "").trim();
  if (!title) return fail("Give the task a title.");
  if (title.length > MAX_TASK_TITLE) return fail(`Keep the title under ${MAX_TASK_TITLE} characters.`);
  const dueDate = input.dueDate || null;
  const dueTime = input.dueTime || null;
  if (dueDate && !isDateString(dueDate)) return fail("That due date isn't valid.");
  if (dueTime && !isTimeString(dueTime)) return fail("That due time isn't valid.");
  if (dueTime && !dueDate) return fail("Pick a due date to go with the time.");

  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, input.dealId),
    columns: { id: true, propertyAddress: true, deletedAt: true },
  });
  if (!deal || deal.deletedAt) return fail("That deal couldn't be found.");

  const assignedToUserId = input.assignedToUserId || user.id;
  if (assignedToUserId !== user.id) {
    const target = await db.query.users.findFirst({ where: eq(users.id, assignedToUserId), columns: { id: true, active: true } });
    if (!target || !target.active) return fail("That person isn't an active team member.");
  }

  await db.insert(dealTasks).values({
    dealId: deal.id,
    title,
    dueDate,
    dueTime: dueDate ? dueTime : null,
    dueAt: dueAtFrom(dueDate, dueTime),
    assignedToUserId,
    createdByUserId: user.id,
  });

  if (assignedToUserId !== user.id) {
    await notifyTaskAssigned({ toUserId: assignedToUserId, byName: user.name?.trim() || "A teammate", title, dealId: deal.id, address: deal.propertyAddress });
  }
  refresh(deal.id);
  return { ok: true };
}

export async function setTaskDone(taskId: string, done: boolean): Promise<Ok | ActionError> {
  const user = await requireUser();
  const task = await db.query.dealTasks.findFirst({ where: eq(dealTasks.id, taskId) });
  if (!task) return fail("That task no longer exists.");
  if (!(await canActOnTask(user, task))) return fail("That task isn't yours to change.");
  await db
    .update(dealTasks)
    .set(done ? { completedAt: new Date(), completedByUserId: user.id } : { completedAt: null, completedByUserId: null })
    .where(eq(dealTasks.id, taskId));
  refresh(task.dealId);
  return { ok: true };
}

export async function deleteTask(taskId: string): Promise<Ok | ActionError> {
  const user = await requireUser();
  const task = await db.query.dealTasks.findFirst({ where: eq(dealTasks.id, taskId) });
  if (!task) return { ok: true };
  if (!(await canActOnTask(user, task)) && task.createdByUserId !== user.id) return fail("That task isn't yours to delete.");
  await db.delete(dealTasks).where(eq(dealTasks.id, taskId));
  refresh(task.dealId);
  return { ok: true };
}

/** "I'm out of the office": someone else looks after my tasks between these days (inclusive). Replaces any earlier coverage. */
export async function setCoverage(input: { coveredByUserId: string; startDate: string; endDate: string }): Promise<Ok | ActionError> {
  const user = await requireUser();
  if (!isDateString(input.startDate) || !isDateString(input.endDate)) return fail("Pick the first day you're away and the day you're back.");
  if (input.endDate < input.startDate) return fail("The return day has to be on or after the first day away.");
  if (input.endDate < todayEt()) return fail("That return day has already passed.");
  if (input.coveredByUserId === user.id) return fail("Pick someone else to cover you.");
  const cover = await db.query.users.findFirst({ where: eq(users.id, input.coveredByUserId), columns: { id: true, active: true } });
  if (!cover || !cover.active) return fail("That person isn't an active team member.");
  await db
    .insert(taskCoverage)
    .values({ fromUserId: user.id, coveredByUserId: cover.id, startDate: input.startDate, endDate: input.endDate })
    .onConflictDoUpdate({ target: taskCoverage.fromUserId, set: { coveredByUserId: cover.id, startDate: input.startDate, endDate: input.endDate } });
  refresh();
  return { ok: true };
}

export async function endCoverage(): Promise<Ok | ActionError> {
  const user = await requireUser();
  await db.delete(taskCoverage).where(eq(taskCoverage.fromUserId, user.id));
  refresh();
  return { ok: true };
}

export async function setTaskReminderMode(mode: string): Promise<Ok | ActionError> {
  const user = await requireUser();
  if (!(REMINDER_MODES as readonly string[]).includes(mode)) return fail("Pick one of the reminder options.");
  await db.update(users).set({ taskReminderMode: mode as ReminderMode }).where(eq(users.id, user.id));
  revalidatePath("/tasks");
  return { ok: true };
}

/** Polled every half minute by each open tab: the task pop-ups that should be showing. */
export async function fetchDueReminders(): Promise<DueReminder[]> {
  const user = await requireUser();
  return listDueReminders(user);
}

/** The pop-up reached this person, so the phone push for it is skipped. */
export async function acknowledgeReminder(taskId: string, kind: "soon" | "now" | "late"): Promise<void> {
  const user = await requireUser();
  const task = await db.query.dealTasks.findFirst({ where: eq(dealTasks.id, taskId), columns: { id: true, assignedToUserId: true } });
  if (!task || !(await canActOnTask(user, task))) return;
  if (kind === "soon") await db.update(dealTasks).set({ headsUpSentAt: new Date() }).where(and(eq(dealTasks.id, taskId), isNull(dealTasks.headsUpSentAt)));
  else await db.update(dealTasks).set({ dueSentAt: new Date() }).where(and(eq(dealTasks.id, taskId), isNull(dealTasks.dueSentAt)));
}
