"use server";

import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { leads, marketingContacts } from "@/server/db/schema";

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
  return { name: contact.name || null };
}
