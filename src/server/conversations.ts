import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { dealConversations, deals } from "@/server/db/schema";

/**
 * Finds the borrower's one shared conversation (by phone number, not by
 * deal — a borrower with several deals still has exactly one thread; see
 * dealConversations' unique constraint on primaryPhone), creating it on
 * first use. Shared by outbound sends (messages.ts, calls.ts) and inbound
 * webhooks — messaging a borrower from ANY of their deals lands here.
 */
export async function getOrCreateConversationForDeal(dealId: string): Promise<{ id: string; primaryPhone: string }> {
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId), columns: { borrowerPhone: true } });
  if (!deal?.borrowerPhone) {
    throw new Error("This deal has no borrower phone number on file yet — add one before texting or calling.");
  }

  const existing = await db.query.dealConversations.findFirst({
    where: eq(dealConversations.primaryPhone, deal.borrowerPhone),
  });
  if (existing) return { id: existing.id, primaryPhone: existing.primaryPhone };

  const [created] = await db
    .insert(dealConversations)
    .values({ dealId, primaryPhone: deal.borrowerPhone })
    .onConflictDoNothing({ target: dealConversations.primaryPhone })
    .returning({ id: dealConversations.id, primaryPhone: dealConversations.primaryPhone });
  if (created) return created;

  // Lost a race against a concurrent create for the same phone number —
  // the row now exists, just re-fetch it.
  const winner = await db.query.dealConversations.findFirst({
    where: eq(dealConversations.primaryPhone, deal.borrowerPhone),
  });
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
