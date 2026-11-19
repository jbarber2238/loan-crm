"use server";

import Anthropic from "@anthropic-ai/sdk";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals, users } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { fail, type ActionError } from "@/lib/action-result";
import { MAX_DRAFT_TASKS, MAX_TRANSCRIPT_CHARS, normalizeDraftTasks, type DraftTask } from "@/lib/task-drafts";
import { addDays, todayEt } from "@/lib/tasks";

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function weekdayOf(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

function firstJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Turns what someone said out loud ("call the appraiser tomorrow at 2, and have Sarah order the title Friday") into a
 * list of draft tasks for one deal. Nothing is saved here: the person reviews and edits the drafts, then adds them.
 */
export async function draftTasksFromTranscript(input: { dealId: string; transcript: string }): Promise<{ ok: true; drafts: DraftTask[] } | ActionError> {
  const viewer = await requireUser();
  const transcript = (input.transcript ?? "").trim().slice(0, MAX_TRANSCRIPT_CHARS);
  if (!transcript) return fail("Record or type what needs to get done first.");
  if (!anthropic) return fail("The AI helper isn't set up on this server.");

  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, input.dealId),
    columns: { id: true, borrowerName: true, propertyAddress: true, deletedAt: true },
  });
  if (!deal || deal.deletedAt) return fail("That deal couldn't be found.");

  const team = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.active, true)));
  const people = team.filter((u): u is { id: string; name: string } => !!u.name?.trim());

  const today = todayEt();
  const system = `You turn a loan officer's spoken notes into a to-do list for ONE mortgage deal in a loan CRM.

Today is ${weekdayOf(today)} ${today} (Eastern time). Weeks start on Monday. The deal is for borrower "${deal.borrowerName ?? "unknown"}" at "${deal.propertyAddress ?? "an address not yet known"}".
Team members tasks can be assigned to: ${people.map((p) => p.name).join(", ") || "(none)"}. The speaker is ${viewer.name ?? "the user"}.

Respond with ONLY a JSON object, no prose: {"tasks":[{"title":"...","dueDate":"YYYY-MM-DD" or null,"dueTime":"HH:MM" or null,"assignee":"a team member's name" or null}]}

Rules:
- One task per distinct thing to do. Split "call X and email Y" into two. Ignore filler, greetings and anything that isn't an action.
- Titles are short imperative phrases under 12 words ("Call the appraiser about the rush fee"). Don't repeat the borrower's name or the address in the title unless it's needed to make the task clear.
- dueDate only when a day is stated or clearly implied ("tomorrow", "Friday", "next Tuesday", "end of the week" = that Friday, "in two weeks"). Compute it from today's date. "Friday" means the coming Friday (today if today is Friday and no other cue). Otherwise null.
- dueTime only when a clock time is stated ("at 2" = 14:00 for business hours, "9:30 in the morning" = 09:30), as 24-hour HH:MM. "Morning", "afternoon" or "end of day" alone are NOT times: leave null. Never set a time without a date.
- assignee only when the speaker names a team member from the list for that task ("have Sarah order the title"). "I", "me", or nobody named: null.
- Never invent tasks, dates, times or people. At most ${MAX_DRAFT_TASKS} tasks. If there is nothing actionable, return {"tasks":[]}.`;

  let reply = "";
  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      thinking: { type: "disabled" },
      system,
      messages: [{ role: "user", content: transcript }],
    });
    const block = response.content.find((b) => b.type === "text");
    reply = block && block.type === "text" ? block.text : "";
  } catch (err) {
    console.error("Task drafting failed:", err);
    return fail("The AI helper couldn't draft tasks just now. Try again in a moment.");
  }

  const drafts = normalizeDraftTasks(firstJson(reply), people, viewer.id);
  // A date in the past is almost always a mis-heard "next" something: don't let the drafts start out overdue.
  const earliest = addDays(today, 0);
  const fixed = drafts.map((d) => (d.dueDate && d.dueDate < earliest ? { ...d, dueDate: null, dueTime: null } : d));
  if (fixed.length === 0) return fail("I couldn't find any tasks in that. Try saying what needs to get done, and by when.");
  return { ok: true, drafts: fixed };
}
