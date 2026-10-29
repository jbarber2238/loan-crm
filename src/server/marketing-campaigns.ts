import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
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

/** Sends queued emails, a few at a time, re-checking consent right before each one. */
async function processQueue(): Promise<{ sent: number; skipped: number; failed: number }> {
  const out = { sent: 0, skipped: 0, failed: 0 };
  const started = Date.now();
  const candidates = await db
    .select({ send: marketingCampaignSends, campaign: marketingCampaigns })
    .from(marketingCampaignSends)
    .innerJoin(marketingCampaigns, eq(marketingCampaigns.id, marketingCampaignSends.campaignId))
    .where(and(eq(marketingCampaignSends.status, "queued"), inArray(marketingCampaigns.status, ["active", "completed"])))
    .orderBy(asc(marketingCampaignSends.queuedAt))
    .limit(SENDS_PER_RUN);
  if (candidates.length === 0) return out;

  const [from, people, logoHtml] = await Promise.all([sender(), loadAllPeople(), getCompanyLogoHtml()]);
  if (!from) return out;
  const byEmail = new Map(people.map((p) => [p.key, p]));
  const signatureHtml = await getUserEmailSignatureHtml(from.id);

  for (const { send, campaign } of candidates) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
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
      });
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
  return out;
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
    })
    .from(marketingCampaignSends)
    .groupBy(marketingCampaignSends.campaignId);
  return new Map(rows.map((r) => [r.campaignId, r]));
}

/** Every campaign, newest activity first. */
export async function loadCampaigns(): Promise<Campaign[]> {
  return db.select().from(marketingCampaigns).orderBy(sql`${marketingCampaigns.updatedAt} desc`);
}
