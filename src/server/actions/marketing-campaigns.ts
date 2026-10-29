"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { marketingCampaigns } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { sendGmailAs } from "@/server/gmail/send";
import { sender } from "@/server/friday";
import { getCompanyLogoHtml } from "@/server/settings";
import { getUserEmailSignatureHtml } from "@/server/users";
import { loadAllPeople } from "@/server/marketing-audience";
import { loadSetupIssues } from "@/server/marketing-setup";
import { raiseAlertOnce } from "@/server/send-limits";
import { runCampaignChat } from "@/server/ai/campaign-builder";
import { marketingEmailFooter } from "@/lib/lead-email-footer";
import { audienceMembers, audienceOptions, isEmailable } from "@/lib/marketing-audience";
import { renderCampaign, unknownTokens, CAMPAIGN_BUTTONS } from "@/lib/campaign-email";
import { firstRunAt, parseSchedule, scheduleProblems, type CampaignSchedule } from "@/lib/campaign-schedule";
import { draftGaps, type CampaignDraft, type ChatMessage } from "@/lib/campaign-draft";

type Result<T = object> = ({ ok: true } & T) | { error: string };

function refresh() {
  revalidatePath("/marketing");
  revalidatePath("/marketing/campaigns");
}

function cleanDraft(raw: CampaignDraft): CampaignDraft | null {
  const schedule = parseSchedule(raw.schedule);
  if (!schedule) return null;
  return {
    name: String(raw.name ?? "").trim().slice(0, 80),
    subject: String(raw.subject ?? "").trim().slice(0, 150),
    body: String(raw.body ?? "").trim().slice(0, 8000),
    audienceKey: String(raw.audienceKey ?? "all").slice(0, 120),
    funnel: raw.funnel ? String(raw.funnel).slice(0, 40) : null,
    tagRecipients: raw.tagRecipients ? String(raw.tagRecipients).slice(0, 40) : null,
    schedule,
    skipPreviousRecipients: Boolean(raw.skipPreviousRecipients),
  };
}

/** One turn of the conversation with the AI builder. Returns what it said and the updated campaign. */
export async function chatWithBuilder(history: ChatMessage[], draft: CampaignDraft): Promise<Result<{ reply: string; draft: CampaignDraft; changes: string[] }>> {
  await requireAdmin();
  const current = cleanDraft(draft);
  if (!current) return { error: "The campaign on the page couldn't be read. Refresh and try again." };
  if (history.length === 0 || history[history.length - 1].role !== "user") return { error: "Say what you'd like first." };
  try {
    const options = audienceOptions(await loadAllPeople());
    const turn = await runCampaignChat(history, current, options);
    return { ok: true, ...turn };
  } catch (err) {
    console.error("Campaign builder chat failed:", err);
    return { error: err instanceof Error ? err.message : "The assistant couldn't answer. Try again." };
  }
}

/** Saves the campaign as it stands. A new one starts as a draft; an existing one keeps its status. */
export async function saveCampaign(id: string | null, raw: CampaignDraft, chat: ChatMessage[]): Promise<Result<{ id: string }>> {
  const user = await requireAdmin();
  const draft = cleanDraft(raw);
  if (!draft) return { error: "The schedule couldn't be read. Pick it again." };
  if (!draft.name) return { error: "Give the campaign a name first." };
  const values = {
    name: draft.name,
    subject: draft.subject,
    body: draft.body,
    audienceKey: draft.audienceKey,
    funnel: draft.funnel,
    tagRecipients: draft.tagRecipients,
    schedule: draft.schedule,
    skipPreviousRecipients: draft.skipPreviousRecipients,
    chat: chat.slice(-40),
    updatedAt: new Date(),
  };
  if (!id) {
    const [row] = await db.insert(marketingCampaigns).values({ ...values, createdByUserId: user.id }).returning({ id: marketingCampaigns.id });
    refresh();
    return { ok: true, id: row.id };
  }
  const existing = await db.query.marketingCampaigns.findFirst({ where: eq(marketingCampaigns.id, id) });
  if (!existing) return { error: "That campaign no longer exists." };
  // Changing the timing of a running campaign moves its next send; a finished one stays finished.
  const patch: Partial<typeof marketingCampaigns.$inferInsert> = { ...values };
  if (existing.status === "active" && JSON.stringify(existing.schedule) !== JSON.stringify(draft.schedule)) {
    const problems = scheduleProblems(draft.schedule, new Date());
    if (problems.length) return { error: problems[0] };
    patch.nextRunAt = firstRunAt(draft.schedule, new Date());
  }
  await db.update(marketingCampaigns).set(patch).where(eq(marketingCampaigns.id, id));
  refresh();
  return { ok: true, id };
}

/** Why a campaign can't start yet, in plain English; empty when it's ready. */
async function startProblems(draft: CampaignDraft, now: Date): Promise<string[]> {
  const problems: string[] = [];
  const gaps = draftGaps(draft);
  if (gaps.length) problems.push(`Still needed: ${gaps.join(", ")}.`);
  const unknown = unknownTokens(`${draft.subject}\n${draft.body}`);
  if (unknown.length) problems.push(`These aren't real merge fields or buttons: ${unknown.map((t) => `{{${t}}}`).join(", ")}.`);
  problems.push(...scheduleProblems(draft.schedule, now).filter(() => draft.schedule.mode !== "draft"));
  const members = audienceMembers(draft.audienceKey, await loadAllPeople());
  if (!members) problems.push("That audience no longer exists. Pick another.");
  else if (!members.some(isEmailable)) problems.push("Nobody on that audience has agreed to marketing yet.");
  return problems;
}

/** Saves the campaign and starts it: it goes live and the first send happens at the scheduled time (right away means within 5 minutes). */
export async function startCampaign(id: string | null, raw: CampaignDraft, chat: ChatMessage[]): Promise<Result<{ id: string; startsAt: string; recipients: number }>> {
  await requireAdmin();
  const draft = cleanDraft(raw);
  if (!draft) return { error: "The schedule couldn't be read. Pick it again." };
  const now = new Date();
  const problems = await startProblems(draft, now);
  if (problems.length) return { error: problems.join(" ") };
  const saved = await saveCampaign(id, draft, chat);
  if ("error" in saved) return saved;
  const first = firstRunAt(draft.schedule, now);
  await db.update(marketingCampaigns).set({ status: "active", nextRunAt: first, updatedAt: now }).where(eq(marketingCampaigns.id, saved.id));
  const members = audienceMembers(draft.audienceKey, await loadAllPeople()) ?? [];
  // The first time anything is started, remind about the setup that was put off (once, ever).
  const from = await sender();
  const issues = await loadSetupIssues(from?.email);
  await raiseAlertOnce("setup_reminder", {
    title: "You started your first campaign: more setup to do",
    body: `${issues.length ? `${issues.join(", ")} ${issues.length === 1 ? "needs" : "need"} fixing so your emails don't land in spam. ` : ""}Bounces also aren't tracked automatically yet; an email service would do that. Open the Email Log tab to see exactly what to fix, and ask me to walk you through it.`,
  });
  refresh();
  return { ok: true, id: saved.id, startsAt: (first ?? now).toISOString(), recipients: members.filter(isEmailable).length };
}

export async function pauseCampaign(id: string): Promise<Result> {
  await requireAdmin();
  await db.update(marketingCampaigns).set({ status: "paused", updatedAt: new Date() }).where(eq(marketingCampaigns.id, id));
  refresh();
  return { ok: true };
}

export async function resumeCampaign(id: string): Promise<Result> {
  await requireAdmin();
  const c = await db.query.marketingCampaigns.findFirst({ where: eq(marketingCampaigns.id, id) });
  if (!c) return { error: "That campaign no longer exists." };
  const schedule: CampaignSchedule | null = parseSchedule(c.schedule);
  const now = new Date();
  // A paused repeat doesn't try to catch up on sends it missed: it picks up at its next regular time.
  const next = schedule?.mode === "repeat" ? firstRunAt(schedule, now) : (c.nextRunAt ?? now);
  if (!next) return { error: "This campaign has no more sends scheduled." };
  await db.update(marketingCampaigns).set({ status: "active", nextRunAt: next, updatedAt: now }).where(eq(marketingCampaigns.id, id));
  refresh();
  return { ok: true };
}

export async function deleteCampaign(id: string): Promise<Result> {
  await requireAdmin();
  const c = await db.query.marketingCampaigns.findFirst({ where: eq(marketingCampaigns.id, id), columns: { status: true } });
  if (c?.status === "active") return { error: "Pause the campaign before deleting it." };
  await db.delete(marketingCampaigns).where(eq(marketingCampaigns.id, id));
  refresh();
  return { ok: true };
}

/** Sends the email as it looks right now to the person logged in, and nobody else. */
export async function sendTestEmail(raw: CampaignDraft): Promise<Result<{ to: string }>> {
  const user = await requireAdmin();
  const draft = cleanDraft(raw);
  if (!draft || !draft.subject || !draft.body) return { error: "Write the subject and the email first." };
  if (!user.email) return { error: "Your account has no email address." };
  const from = await sender();
  if (!from) return { error: "No sender is set up." };
  const rendered = renderCampaign({ subject: draft.subject, body: draft.body, name: user.name ?? "" }, (key) => CAMPAIGN_BUTTONS[key].path);
  const [logoHtml, signatureHtml] = await Promise.all([getCompanyLogoHtml(), getUserEmailSignatureHtml(from.id)]);
  try {
    await sendGmailAs(from.id, from.email, {
      to: user.email,
      subject: `[Test] ${rendered.subject}`,
      body: logoHtml + rendered.html + signatureHtml + marketingEmailFooter("https://mannalendingco.com/unsubscribe"),
      html: true,
      category: "marketing_campaign",
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "The test email couldn't be sent." };
  }
  return { ok: true, to: user.email };
}
