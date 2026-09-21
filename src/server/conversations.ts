import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { dealConversations, deals } from "@/server/db/schema";
import { toE164 } from "@/server/twilio-client";

/**
 * Finds the ONE shared conversation for a phone number — a person with
 * several deals (or a lender rep who works several of them) still has
 * exactly one thread; see dealConversations' unique constraint on
 * primaryPhone — creating it on first use. `dealId` is only recorded for a
 * brand-new conversation as informational context (see the schema
 * comment); it's never used to look one up.
 */
export async function getOrCreateConversationForPhone(
  rawPhone: string,
  dealId?: string
): Promise<{ id: string; primaryPhone: string }> {
  const phone = toE164(rawPhone);
  const existing = await db.query.dealConversations.findFirst({ where: eq(dealConversations.primaryPhone, phone) });
  if (existing) return { id: existing.id, primaryPhone: existing.primaryPhone };

  const [created] = await db
    .insert(dealConversations)
    .values({ dealId: dealId ?? null, primaryPhone: phone })
    .onConflictDoNothing({ target: dealConversations.primaryPhone })
    .returning({ id: dealConversations.id, primaryPhone: dealConversations.primaryPhone });
  if (created) return created;

  // Lost a race against a concurrent create for the same phone number —
  // the row now exists, just re-fetch it.
  const winner = await db.query.dealConversations.findFirst({ where: eq(dealConversations.primaryPhone, phone) });
  if (!winner) throw new Error("Failed to create conversation");
  return winner;
}

/**
 * Inbound webhook entry point: finds the conversation for a phone number
 * (matching either a conversation's own primaryPhone or one of its ad-hoc
 * participants), or falls back to matching a deal's borrowerPhone directly
 * and creating the conversation on the spot, or finally creates a brand-new,
 * unattached conversation — an unmatched call/text always lands somewhere.
 */
export async function findOrCreateConversationForInbound(phone: string): Promise<{ id: string; dealId: string | null }> {
  const existingConversation = await db.query.dealConversations.findFirst({
    where: eq(dealConversations.primaryPhone, phone),
  });
  if (existingConversation) return { id: existingConversation.id, dealId: existingConversation.dealId };

  const existingParticipant = await db.query.dealConversationParticipants.findFirst({
    where: (p, { eq: eqP }) => eqP(p.phone, phone),
  });
  if (existingParticipant) {
    const conversation = await db.query.dealConversations.findFirst({
      where: eq(dealConversations.id, existingParticipant.conversationId),
    });
    if (conversation) return { id: conversation.id, dealId: conversation.dealId };
  }

  const matchedDeal = await db.query.deals.findFirst({
    where: eq(deals.borrowerPhone, phone),
    columns: { id: true },
    orderBy: (d, { desc }) => desc(d.createdAt),
  });

  const [created] = await db
    .insert(dealConversations)
    .values({ dealId: matchedDeal?.id ?? null, primaryPhone: phone })
    .returning({ id: dealConversations.id, dealId: dealConversations.dealId });
  return created;
}
