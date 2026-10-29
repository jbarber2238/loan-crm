import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { leads, marketingContacts } from "@/server/db/schema";
import { emailKey } from "@/lib/marketing-audience";

export type ConsentOutcome = "recorded" | "already" | "unsubscribed";

/**
 * Records that someone agreed to marketing emails, on their behalf by staff. Does nothing when they already count as
 * agreed, and refuses when they opted out themselves through an unsubscribe link (a staff-made removal can be undone).
 */
export async function recordAgreedConsent(input: {
  email: string;
  name: string;
  phone: string;
  source: "staff" | "follow_up" | "manual";
  note: string | null;
  userId: string;
}): Promise<ConsentOutcome> {
  const email = emailKey(input.email);
  const [contact, lead] = await Promise.all([
    db.query.marketingContacts.findFirst({ where: eq(marketingContacts.email, email) }),
    db.query.leads.findFirst({ where: eq(leads.email, email), columns: { marketingConsent: true, unsubscribedAt: true } }),
  ]);
  const optedOutThemselves = Boolean(lead?.unsubscribedAt) || Boolean(contact?.unsubscribedAt && contact.unsubscribeSource !== "staff");
  if (optedOutThemselves) return "unsubscribed";
  const staffRemoved = Boolean(contact?.unsubscribedAt);
  if (!staffRemoved && (lead?.marketingConsent || contact?.marketingConsent)) return "already";
  const now = new Date();
  await db
    .insert(marketingContacts)
    .values({ email, name: input.name, phone: input.phone, marketingConsent: true, consentSource: input.source, consentNote: input.note, consentAt: now, createdByUserId: input.userId })
    .onConflictDoUpdate({
      target: marketingContacts.email,
      set: { marketingConsent: true, consentSource: input.source, consentNote: input.note, consentAt: now, unsubscribedAt: null, unsubscribeSource: null },
    });
  return "recorded";
}
