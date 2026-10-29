// The campaign being built in the Email Builder, and how the AI's suggestions are folded into it. Pure.

import { CAMPAIGN_BUTTONS, FUNNELS, funnelLabel } from "@/lib/campaign-email";
import { describeSchedule, parseSchedule, type CampaignSchedule, type RepeatEvery } from "@/lib/campaign-schedule";
import { addDays, etDay } from "@/lib/friday-schedule";
import { normalizeTag } from "@/lib/marketing-audience";

export interface CampaignDraft {
  name: string;
  subject: string;
  body: string;
  audienceKey: string;
  funnel: string | null;
  /** Null = the automatic "campaign: <name>" tag. */
  tagRecipients: string | null;
  schedule: CampaignSchedule;
  skipPreviousRecipients: boolean;
}

export const EMPTY_DRAFT: CampaignDraft = {
  name: "",
  subject: "",
  body: "",
  audienceKey: "all",
  funnel: null,
  tagRecipients: null,
  schedule: { mode: "draft" },
  skipPreviousRecipients: true,
};

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function timeParts(v: unknown): { hour: number; minute: number } | null {
  const m = typeof v === "string" ? v.trim().match(/^(\d{1,2}):(\d{2})$/) : null;
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  return hour <= 23 && minute <= 59 ? { hour, minute } : null;
}

const asDay = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** The AI's loose description of when to send, turned into a real schedule (null when it left out something needed). */
export function scheduleFromAi(raw: unknown, today: string): CampaignSchedule | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.mode === "draft") return { mode: "draft" };
  if (r.mode === "now") return { mode: "once", now: true };
  const time = timeParts(r.time) ?? { hour: 9, minute: 0 };
  if (r.mode === "once") {
    const date = asDay(r.date);
    return date ? parseSchedule({ mode: "once", now: false, date, ...time }) : null;
  }
  if (r.mode === "repeat") {
    const every: RepeatEvery | null = r.repeat_every === "week" || r.repeat_every === "two_weeks" || r.repeat_every === "month" ? r.repeat_every : null;
    if (!every) return null;
    const weekday = typeof r.weekday === "string" ? WEEKDAYS.indexOf(r.weekday.toLowerCase()) : -1;
    if (every !== "month" && weekday < 0) return null;
    const dayOfMonth = typeof r.day_of_month === "number" ? r.day_of_month : 1;
    return parseSchedule({
      mode: "repeat",
      every,
      weekday: weekday < 0 ? 1 : weekday,
      dayOfMonth,
      ...time,
      startDate: asDay(r.start_date) ?? addDays(today, 1),
      endDate: asDay(r.end_date),
      maxRuns: typeof r.max_runs === "number" ? r.max_runs : null,
    });
  }
  return null;
}

/**
 * Folds one `update_campaign` call from the AI into the draft. Anything invalid is left as it was and reported,
 * so the person never sees a setting the system couldn't actually use. `changes` is plain English for the chat.
 */
export function applyDraftUpdate(draft: CampaignDraft, raw: unknown, audienceLabels: Map<string, string>, now: Date): { draft: CampaignDraft; changes: string[]; problems: string[] } {
  const next = { ...draft };
  const changes: string[] = [];
  const problems: string[] = [];
  const u = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  if (typeof u.name === "string" && u.name.trim() && u.name.trim() !== draft.name) {
    next.name = u.name.trim().slice(0, 80);
    changes.push(`Campaign name: ${next.name}`);
  }
  if (typeof u.subject === "string" && u.subject.trim() && u.subject.trim() !== draft.subject) {
    next.subject = u.subject.trim().slice(0, 150);
    changes.push("Wrote the subject line");
  }
  if (typeof u.body === "string" && u.body.trim() && u.body.trim() !== draft.body) {
    next.body = u.body.trim().slice(0, 8000);
    changes.push(draft.body ? "Rewrote the email" : "Drafted the email");
  }
  if (typeof u.audience_key === "string" && u.audience_key !== draft.audienceKey) {
    const label = audienceLabels.get(u.audience_key);
    if (label) {
      next.audienceKey = u.audience_key;
      changes.push(`Audience: ${label}`);
    } else problems.push("I tried to pick an audience that doesn't exist, so I left it alone.");
  }
  if (typeof u.funnel === "string") {
    const funnel = u.funnel === "none" ? null : FUNNELS.some((f) => f.value === u.funnel) ? u.funnel : undefined;
    if (funnel === undefined) problems.push("I tried to link a campaign that doesn't exist, so I left it alone.");
    else if (funnel !== draft.funnel) {
      next.funnel = funnel;
      changes.push(`Linked to: ${funnelLabel(funnel)}`);
    }
  }
  if (typeof u.tag_recipients === "string") {
    const tag = u.tag_recipients.trim() ? normalizeTag(u.tag_recipients) : null;
    if (u.tag_recipients.trim() && !tag) problems.push("That tag wasn't usable, so I left it alone.");
    else if (tag !== draft.tagRecipients) {
      next.tagRecipients = tag;
      changes.push(tag ? `Tag for everyone who gets it: ${tag}` : "Using the automatic campaign tag");
    }
  }
  if (typeof u.skip_previous_recipients === "boolean" && u.skip_previous_recipients !== draft.skipPreviousRecipients) {
    next.skipPreviousRecipients = u.skip_previous_recipients;
    changes.push(u.skip_previous_recipients ? "Won't resend to anyone who already got it" : "Will send to everyone each time");
  }
  if (u.schedule !== undefined) {
    const schedule = scheduleFromAi(u.schedule, etDay(now));
    if (!schedule) problems.push("I didn't have enough to set the schedule (a date or a day of the week is missing).");
    else if (JSON.stringify(schedule) !== JSON.stringify(draft.schedule)) {
      next.schedule = schedule;
      changes.push(`Schedule: ${describeSchedule(schedule)}`);
    }
  }
  return { draft: next, changes, problems };
}

/** What still has to be filled in before a campaign can start, in plain English. */
export function draftGaps(d: CampaignDraft): string[] {
  const gaps: string[] = [];
  if (!d.name.trim()) gaps.push("a campaign name");
  if (!d.subject.trim()) gaps.push("a subject line");
  if (!d.body.trim()) gaps.push("the email itself");
  if (d.schedule.mode === "draft") gaps.push("when it should go out");
  return gaps;
}

export function buttonListForPrompt(): string {
  return Object.entries(CAMPAIGN_BUTTONS)
    .map(([key, b]) => `- {{${key}}}: a button that says "${b.label}" (${b.description})`)
    .join("\n");
}
