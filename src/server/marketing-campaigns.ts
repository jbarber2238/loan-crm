import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { marketingCampaignSends, marketingCampaigns, marketingContactTags } from "@/server/db/schema";
import { sendGmailAs } from "@/server/gmail/send";
import { sender } from "@/server/friday";
import { getCompanyLogoHtml } from "@/server/settings";
import { getUserEmailSignatureHtml } from "@/server/users";
import { appUrl } from "@/server/partner/email";
import { ensureContactId, loadAllPeople } from "@/server/marketing-audience";
import { audienceMembers, isEmailable, normalizeTag } from "@/lib/marketing-audience";
import { campaignTags, renderCampaign } from "@/lib/campaign-email";
import { nextRunAfter, parseSchedule } from "@/lib/campaign-schedule";
import { CONTACT_UNSUBSCRIBE_URL } from "@/lib/lead-constants";
import { etDay, etParts } from "@/lib/friday-schedule";
import { campaignHealth, capStatus, WARN_FRACTION, type CampaignCounts } from "@/lib/send-limits";
import { getMarketingLimits, raiseAlertOnce, sentLast24h } from "@/server/send-limits";
import { marketingEmailFooter } from "@/lib/lead-email-footer";

export type Campaign = typeof marketingCampaigns.$inferSelect;

const SENDS_PER_RUN = 25;
const TIME_BUDGET_MS = 40_000;

/** Puts everyone a due campaign is meant for into the send queue, once per run. */
async function queueRun(c: Campaign, now: Date): Promise<number> {
  if (!c.nextRunAt) return 0;
  const schedule = parseSchedule(c.schedule);
  const runsDone = c.runCount + 1;
  const next = schedule ? nextRunAfter(schedule, c.nextRunAt, runsDone) : null;
  // The conditional update is the claim: if another run already took this one, nothing changes and we stop.
  const claimed = await db
    .update(marketingCampaigns)
    .set({ lastRunAt: now, runCount: runsDone, nextRunAt: next, status: next ? "active" : "completed", updatedAt: now })
    .where(and(eq(marketingCampaigns.id, c.id), eq(marketingCampaigns.status, "active"), eq(marketingCampaigns.nextRunAt, c.nextRunAt)))
    .returning({ id: marketingCampaigns.id });
  if (claimed.length === 0) return 0;

  const people = await loadAllPeople();
  const members = audienceMembers(c.audienceKey, people);
  if (!members) {
    console.error(`Campaign ${c.id}: audience "${c.audienceKey}" no longer exists`);
    await db.update(marketingCampaigns).set({ status: "paused" }).where(eq(marketingCampaigns.id, c.id));
    return 0;
  }
  let recipients = members.filter(isEmailable);
  if (c.skipPreviousRecipients) {
    const before = await db
      .select({ email: marketingCampaignSends.email })
      .from(marketingCampaignSends)
      .where(and(eq(marketingCampaignSends.campaignId, c.id), inArray(marketingCampaignSends.status, ["queued", "sending", "sent"])));
    const done = new Set(before.map((r) => r.email));
    recipients = recipients.filter((p) => !done.has(p.key));
  }
  // Nobody gets two campaign emails too close together, whatever the campaigns.
  const { minDaysBetween } = await getMarketingLimits();
  if (minDaysBetween > 0 && recipients.length > 0) {
    const since = new Date(now.getTime() - minDaysBetween * 86_400_000);
    const recent = await db
      .select({ email: marketingCampaignSends.email })
      .from(marketingCampaignSends)
      .where(and(eq(marketingCampaignSends.status, "sent"), gte(marketingCampaignSends.sentAt, since)));
    const tooSoon = new Set(recent.map((r) => r.email));
    recipients = recipients.filter((p) => !tooSoon.has(p.key));
  }
  if (recipients.length === 0) return 0;
  const runKey = c.nextRunAt.toISOString();
  await db
    .insert(marketingCampaignSends)
    .values(recipients.map((p) => ({ campaignId: c.id, runKey, email: p.key, contactName: p.name })))
    .onConflictDoNothing();
  return recipients.length;
}

async function addTag(email: string, tag: string) {
  const t = normalizeTag(tag);
  if (t) await db.insert(marketingContactTags).values({ email, tag: t }).onConflictDoNothing();
}

/** Campaign emails only go out in the daytime (Eastern), never in the middle of the night. */
function inSendWindow(now: Date): boolean {
  const h = etParts(now).hour;
  return h >= 7 && h < 20;
}

/** Sends queued emails, a few at a time, re-checking consent right before each one and stopping at the daily limits. */
async function processQueue(now = new Date()): Promise<{ sent: number; skipped: number; failed: number; held?: string }> {
  const out: { sent: number; skipped: number; failed: number; held?: string } = { sent: 0, skipped: 0, failed: 0 };
  const started = Date.now();
  const [waiting] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(marketingCampaignSends)
    .innerJoin(marketingCampaigns, eq(marketingCampaigns.id, marketingCampaignSends.campaignId))
    .where(and(eq(marketingCampaignSends.status, "queued"), inArray(marketingCampaigns.status, ["active", "completed"])));
  if (waiting.n === 0) return out;
  if (!inSendWindow(now)) return { ...out, held: "outside sending hours" };

  const from = await sender();
  if (!from) return out;
  const [limits, used] = await Promise.all([getMarketingLimits(), sentLast24h(from.id, now)]);
  let room = capStatus({ used24h: used.total, dailyLimit: limits.dailyLimit, campaignUsed24h: used.campaign, campaignDailyMax: limits.campaignDailyMax }).campaignRoom;
  if (room <= 0) {
    const day = etDay(now);
    await raiseAlertOnce(`cap_hold:${day}`, {
      title: "Campaign emails are waiting on your daily limit",
      body: `${waiting.n} campaign emails are queued, but today's room is used up (${used.total} of ${limits.dailyLimit} sent in 24 hours, ${used.campaign} of your ${limits.campaignDailyMax} campaign maximum). They'll go out automatically as room frees up.`,
    });
    return { ...out, held: "daily limit reached" };
  }

  const candidates = await db
    .select({ send: marketingCampaignSends, campaign: marketingCampaigns })
    .from(marketingCampaignSends)
    .innerJoin(marketingCampaigns, eq(marketingCampaigns.id, marketingCampaignSends.campaignId))
    .where(and(eq(marketingCampaignSends.status, "queued"), inArray(marketingCampaigns.status, ["active", "completed"])))
    .orderBy(asc(marketingCampaignSends.queuedAt))
    .limit(Math.min(SENDS_PER_RUN, room));
  if (candidates.length === 0) return out;

  const [people, logoHtml] = await Promise.all([loadAllPeople(), getCompanyLogoHtml()]);
  const byEmail = new Map(people.map((p) => [p.key, p]));
  const signatureHtml = await getUserEmailSignatureHtml(from.id);

  for (const { send, campaign } of candidates) {
    if (Date.now() - started > TIME_BUDGET_MS || room <= 0) break;
    const [claim] = await db
      .update(marketingCampaignSends)
      .set({ status: "sending" })
      .where(and(eq(marketingCampaignSends.id, send.id), eq(marketingCampaignSends.status, "queued")))
      .returning({ id: marketingCampaignSends.id });
    if (!claim) continue;
    const person = byEmail.get(send.email);
    if (!person || !isEmailable(person)) {
      await db.update(marketingCampaignSends).set({ status: "skipped", error: "No longer on the marketing list" }).where(eq(marketingCampaignSends.id, send.id));
      out.skipped++;
      continue;
    }
    try {
      const contactId = person.contactId ?? (await ensureContactId(person.email, person.name, person.phone));
      const rendered = renderCampaign({ subject: campaign.subject, body: campaign.body, name: person.name }, (key) => `${appUrl()}/api/marketing/click/${send.id}/${key}`);
      await sendGmailAs(from.id, from.email, {
        to: person.email,
        replyTo: from.email,
        subject: rendered.subject,
        body: logoHtml + rendered.html + signatureHtml + marketingEmailFooter(CONTACT_UNSUBSCRIBE_URL(contactId)),
        html: true,
        category: "marketing_campaign",
        extraHeaders: listUnsubscribeHeaders(contactId, from.email),
      });
      room--;
      await db.update(marketingCampaignSends).set({ status: "sent", sentAt: new Date() }).where(eq(marketingCampaignSends.id, send.id));
      await addTag(person.key, campaignTags(campaign.name, campaign.tagRecipients).sent);
      out.sent++;
    } catch (err) {
      console.error(`Campaign ${campaign.id} send to ${send.email} failed:`, err);
      await db
        .update(marketingCampaignSends)
        .set({ status: "failed", error: err instanceof Error ? err.message.slice(0, 300) : "Unknown error" })
        .where(eq(marketingCampaignSends.id, send.id));
      out.failed++;
    }
  }

  // Warn once a day when the account is getting close to Gmail's limit, before it becomes a problem.
  const after = used.total + out.sent;
  if (after >= limits.dailyLimit * WARN_FRACTION) {
    await raiseAlertOnce(`cap_warn:${etDay(now)}`, {
      title: "You're using most of your daily Gmail sending limit",
      body: `${after} of ${limits.dailyLimit} emails sent in the last 24 hours. Campaigns stop at ${Math.floor(limits.dailyLimit * 0.9)} so everyday email keeps working.`,
    });
  }
  for (const id of new Set(candidates.map((c) => c.campaign.id))) await checkCampaignHealth(id);
  return out;
}

/** The one-click unsubscribe headers mail apps turn into their own "Unsubscribe" button (and Gmail expects from bulk senders). */
function listUnsubscribeHeaders(contactId: string, fromEmail: string): string[] {
  const url = `${appUrl()}/api/marketing/unsubscribe/${contactId}`;
  return [`List-Unsubscribe: <${url}>, <mailto:${fromEmail}?subject=unsubscribe>`, "List-Unsubscribe-Post: List-Unsubscribe=One-Click"];
}

/** Counts for one campaign's health. */
async function countsFor(campaignId: string): Promise<CampaignCounts> {
  const [r] = await db
    .select({
      sent: sql<number>`count(*) filter (where ${marketingCampaignSends.status} = 'sent')`.mapWith(Number),
      failed: sql<number>`count(*) filter (where ${marketingCampaignSends.status} = 'failed')`.mapWith(Number),
      bounced: sql<number>`count(*) filter (where ${marketingCampaignSends.bouncedAt} is not null)`.mapWith(Number),
      unsubscribed: sql<number>`count(*) filter (where ${marketingCampaignSends.unsubscribedAt} is not null)`.mapWith(Number),
      clicked: sql<number>`count(*) filter (where ${marketingCampaignSends.clickedAt} is not null)`.mapWith(Number),
    })
    .from(marketingCampaignSends)
    .where(eq(marketingCampaignSends.campaignId, campaignId));
  return r;
}

/**
 * Looks at a campaign's bounces, failures and unsubscribes. A bad rate pauses the campaign (so it can't keep hurting
 * the sender's reputation) and alerts you; a worrying one just alerts you.
 */
export async function checkCampaignHealth(campaignId: string): Promise<void> {
  const campaign = await db.query.marketingCampaigns.findFirst({ where: eq(marketingCampaigns.id, campaignId) });
  if (!campaign) return;
  const health = campaignHealth(await countsFor(campaignId));
  if (health.level === "ok") return;
  const href = "/marketing/email-log";
  if (health.level === "pause") {
    if (campaign.status === "active") {
      await db.update(marketingCampaigns).set({ status: "paused", pauseReason: health.reasons.join("; "), updatedAt: new Date() }).where(eq(marketingCampaigns.id, campaignId));
    }
    await raiseAlertOnce(`health_pause:${campaignId}`, { title: `“${campaign.name}” was paused`, body: `${health.reasons.join("; ")}. I stopped it so it doesn't hurt your sending reputation. Review the list, then resume it from Email Campaigns.`, href });
  } else {
    await raiseAlertOnce(`health_watch:${campaignId}:${etDay(new Date())}`, { title: `Watch “${campaign.name}”`, body: `${health.reasons.join("; ")}.`, href });
  }
}

/** Called every few minutes: starts any campaign run that's due, then works through the queue. */
export async function runMarketingCampaigns(now = new Date()) {
  const due = await db
    .select()
    .from(marketingCampaigns)
    .where(and(eq(marketingCampaigns.status, "active"), lte(marketingCampaigns.nextRunAt, now)));
  let queued = 0;
  for (const c of due) queued += await queueRun(c, now);
  return { queued, ...(await processQueue()) };
}

export interface CampaignStats {
  queued: number;
  sent: number;
  failed: number;
  skipped: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
}

export async function loadCampaignStats(): Promise<Map<string, CampaignStats>> {
  const rows = await db
    .select({
      campaignId: marketingCampaignSends.campaignId,
      queued: sql<number>`count(*) filter (where ${marketingCampaignSends.status} in ('queued','sending'))`.mapWith(Number),
      sent: sql<number>`count(*) filter (where ${marketingCampaignSends.status} = 'sent')`.mapWith(Number),
      failed: sql<number>`count(*) filter (where ${marketingCampaignSends.status} = 'failed')`.mapWith(Number),
      skipped: sql<number>`count(*) filter (where ${marketingCampaignSends.status} = 'skipped')`.mapWith(Number),
      clicked: sql<number>`count(*) filter (where ${marketingCampaignSends.clickedAt} is not null)`.mapWith(Number),
      bounced: sql<number>`count(*) filter (where ${marketingCampaignSends.bouncedAt} is not null)`.mapWith(Number),
      unsubscribed: sql<number>`count(*) filter (where ${marketingCampaignSends.unsubscribedAt} is not null)`.mapWith(Number),
    })
    .from(marketingCampaignSends)
    .groupBy(marketingCampaignSends.campaignId);
  return new Map(rows.map((r) => [r.campaignId, r]));
}

/** Every campaign, newest activity first. */
export async function loadCampaigns(): Promise<Campaign[]> {
  return db.select().from(marketingCampaigns).orderBy(sql`${marketingCampaigns.updatedAt} desc`);
}
