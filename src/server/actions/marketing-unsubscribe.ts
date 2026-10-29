"use server";

import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import { leads, marketingCampaignSends, marketingContacts } from "@/server/db/schema";
import { checkCampaignHealth } from "@/server/marketing-campaigns";

/**
 * Public, no login: the opt-out link at the bottom of every marketing campaign email. Stops marketing emails to this
 * person everywhere (a lead record with the same email too). Direct outreach about a deal in progress isn't affected.
 */
export async function unsubscribeContactFromMarketing(contactId: string): Promise<{ name: string | null }> {
  if (!/^[0-9a-f-]{36}$/i.test(contactId)) return { name: null };
  const contact = await db.query.marketingContacts.findFirst({ where: eq(marketingContacts.id, contactId) });
  if (!contact) return { name: null };
  const now = new Date();
  if (!contact.unsubscribedAt || contact.unsubscribeSource === "staff") {
    await db.update(marketingContacts).set({ unsubscribedAt: now, unsubscribeSource: "link" }).where(eq(marketingContacts.id, contactId));
  }
  await db.update(leads).set({ unsubscribedAt: now }).where(eq(leads.email, contact.email));
  // Count it against the campaign that emailed them last, so unsubscribe rates show up in the log.
  const [last] = await db
    .select({ id: marketingCampaignSends.id, campaignId: marketingCampaignSends.campaignId })
    .from(marketingCampaignSends)
    .where(and(eq(marketingCampaignSends.email, contact.email), eq(marketingCampaignSends.status, "sent"), isNull(marketingCampaignSends.unsubscribedAt)))
    .orderBy(desc(marketingCampaignSends.sentAt))
    .limit(1);
  if (last) {
    await db.update(marketingCampaignSends).set({ unsubscribedAt: now }).where(eq(marketingCampaignSends.id, last.id));
    await checkCampaignHealth(last.campaignId).catch((err) => console.error("Campaign health check failed:", err));
  }
  return { name: contact.name || null };
}
