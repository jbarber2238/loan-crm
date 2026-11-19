// Turns the AI's reply to a dictated list of tasks into drafts the form can show. Pure, so the rules are testable.

import { MAX_TASK_TITLE, isDateString, isTimeString } from "@/lib/tasks";

export const MAX_DRAFT_TASKS = 15;
export const MAX_TRANSCRIPT_CHARS = 6000;

export interface DraftTask {
  title: string;
  dueDate: string | null;
  dueTime: string | null;
  /** A teammate's user id when the speaker said who it's for; null means "me". */
  assignedToUserId: string | null;
}

export interface DraftUser {
  id: string;
  name: string;
}

/** Match a spoken name ("Sarah", "Sarah Lee") to exactly one teammate; an unknown or ambiguous name matches nobody. */
export function matchAssignee(spoken: unknown, users: DraftUser[], viewerId: string): string | null {
  if (typeof spoken !== "string") return null;
  const name = spoken.trim().toLowerCase();
  if (!name || ["me", "myself", "i", "self"].includes(name)) return null;
  const exact = users.filter((u) => u.name.trim().toLowerCase() === name);
  if (exact.length === 1) return exact[0].id === viewerId ? null : exact[0].id;
  const byFirst = users.filter((u) => u.name.trim().toLowerCase().split(/\s+/)[0] === name);
  if (byFirst.length === 1) return byFirst[0].id === viewerId ? null : byFirst[0].id;
  return null;
}

/** Keep only well-formed tasks: a title, a real date, a time only alongside a date, and a recognisable assignee. */
export function normalizeDraftTasks(raw: unknown, users: DraftUser[], viewerId: string): DraftTask[] {
  const list = raw && typeof raw === "object" && Array.isArray((raw as { tasks?: unknown }).tasks) ? (raw as { tasks: unknown[] }).tasks : [];
  const out: DraftTask[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const title = typeof r.title === "string" ? r.title.replace(/\s+/g, " ").trim().slice(0, MAX_TASK_TITLE) : "";
    if (!title) continue;
    const dueDate = isDateString(r.dueDate) ? r.dueDate : null;
    const dueTime = dueDate && isTimeString(r.dueTime) ? r.dueTime : null;
    out.push({ title, dueDate, dueTime, assignedToUserId: matchAssignee(r.assignee, users, viewerId) });
    if (out.length >= MAX_DRAFT_TASKS) break;
  }
  return out;
}
