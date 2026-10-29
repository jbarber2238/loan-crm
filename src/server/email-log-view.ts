import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/server/db/client";
import { emailLogEntries, marketingCampaignSends, marketingCampaigns } from "@/server/db/schema";

export interface CampaignSendRow {
  id: string;
  campaignId: string;
  campaignName: string;
  email: string;
  name: string | null;
  status: string;
  error: string | null;
  sentAt: string | null;
  queuedAt: string;
  clicked: boolean;
  bounced: boolean;
  unsubscribed: boolean;
}

export interface OtherEmailRow {
  id: string;
  toEmail: string;
  subject: string;
  category: string;
  sentAt: string;
}

/** The most recent campaign emails, one row per person. */
export async function loadCampaignSends(limit = 300): Promise<CampaignSendRow[]> {
  const rows = await db
    .select({ s: marketingCampaignSends, name: marketingCampaigns.name })
    .from(marketingCampaignSends)
    .innerJoin(marketingCampaigns, eq(marketingCampaigns.id, marketingCampaignSends.campaignId))
    .orderBy(desc(marketingCampaignSends.queuedAt))
    .limit(limit);
  return rows.map(({ s, name }) => ({
    id: s.id,
    campaignId: s.campaignId,
    campaignName: name,
    email: s.email,
    name: s.contactName,
    status: s.status,
    error: s.error,
    sentAt: s.sentAt?.toISOString() ?? null,
    queuedAt: s.queuedAt.toISOString(),
    clicked: s.clickedAt !== null,
    bounced: s.bouncedAt !== null,
    unsubscribed: s.unsubscribedAt !== null,
  }));
}

/** Everything else this account sent through the CRM: sequences, partner reminders, deal emails. */
export async function loadOtherEmails(userId: string, limit = 200): Promise<OtherEmailRow[]> {
  const rows = await db
    .select({ id: emailLogEntries.id, toEmail: emailLogEntries.toEmail, subject: emailLogEntries.subject, category: emailLogEntries.category, sentAt: emailLogEntries.sentAt })
    .from(emailLogEntries)
    .where(and(eq(emailLogEntries.sentByUserId, userId), ne(emailLogEntries.category, "marketing_campaign")))
    .orderBy(desc(emailLogEntries.sentAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, sentAt: r.sentAt.toISOString() }));
}
