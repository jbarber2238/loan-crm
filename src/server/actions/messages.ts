"use server";

import { desc, eq, ilike, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { dealConversations, dealConversationParticipants, dealMessages, deals } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { sendSms, toE164 } from "@/server/twilio-client";
import { getOrCreateConversationForDeal } from "@/server/conversations";

function baseUrl() {
  return process.env.APP_URL ?? "http://localhost:3000";
}

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * "Message Borrower" from a deal's header — finds or creates that
 * borrower's ONE shared conversation (same thread regardless of which of
 * their deals you're viewing) and returns what the floating chat dock
 * needs to open it in place, pre-filled with a plain-text opener naming
 * this specific deal. That opener is just typed text, not a stored tag —
 * there's no per-deal message filtering anywhere; the borrower may have
 * several deals and one continuous thread, and the opener is the only
 * thing that tells either side which one a given message is about.
 */
export async function prepareBorrowerConversation(dealId: string) {
  await requireUser();
  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    columns: { propertyAddress: true, borrowerName: true },
  });
  const conversation = await getOrCreateConversationForDeal(dealId);
  const opener = deal ? `Regarding your deal located at ${deal.propertyAddress}:\n\n` : "";
  return {
    conversationId: conversation.id,
    borrowerPhone: conversation.primaryPhone,
    borrowerName: deal?.borrowerName ?? conversation.primaryPhone,
    initialBody: opener,
  };
}

/** The floating chat dock's own data fetch — same shape the Inbox conversation page reads, just returned to a client component instead of rendered server-side. */
export async function getConversationForDock(conversationId: string) {
  await requireUser();
  const conversation = await db.query.dealConversations.findFirst({
    where: eq(dealConversations.id, conversationId),
    with: {
      messages: { orderBy: (m, { asc }) => asc(m.createdAt) },
      callLogs: { orderBy: (c, { asc }) => asc(c.startedAt) },
      participants: true,
    },
  });
  if (!conversation) throw new Error("Conversation not found");
  return conversation;
}

export interface BorrowerSearchResult {
  dealId: string;
  borrowerName: string;
  borrowerPhone: string;
  propertyAddress: string;
  stage: string;
}

/** Global "New Message" search — borrower name across every deal, so messaging someone doesn't require finding one of their deals first. Deduped by phone isn't done here (each deal's own address is useful context to pick from when a name matches more than one deal); opening a result reuses that borrower's one shared conversation regardless of which deal you picked. */
export async function searchBorrowers(query: string): Promise<BorrowerSearchResult[]> {
  await requireUser();
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const rows = await db.query.deals.findMany({
    where: (d, { and, isNull: isNullD }) => and(ilike(d.borrowerName, `%${trimmed}%`), isNullD(d.deletedAt)),
    columns: { id: true, borrowerName: true, borrowerPhone: true, propertyAddress: true, stage: true },
    orderBy: (d, { desc: descD }) => descD(d.createdAt),
    limit: 15,
  });

  return rows
    .filter((d): d is typeof d & { borrowerPhone: string } => Boolean(d.borrowerPhone))
    .map((d) => ({
      dealId: d.id,
      borrowerName: d.borrowerName,
      borrowerPhone: d.borrowerPhone,
      propertyAddress: d.propertyAddress,
      stage: d.stage,
    }));
}

/** Same send, for an Inbox conversation not (yet) tied to any deal. */
export async function sendConversationMessage(conversationId: string, formData: FormData) {
  const user = await requireUser();
  const body = str(formData, "body");
  if (!body) throw new Error("Message can't be empty");

  await sendToConversation(conversationId, body, user.id);

  revalidatePath("/inbox");
}

async function sendToConversation(conversationId: string, body: string, sentByUserId: string) {
  const conversation = await db.query.dealConversations.findFirst({
    where: eq(dealConversations.id, conversationId),
    with: { participants: true },
  });
  if (!conversation) throw new Error("Conversation not found");

  const recipients = [conversation.primaryPhone, ...conversation.participants.map((p) => p.phone)];
  const statusCallbackUrl = `${baseUrl()}/api/webhooks/twilio-sms-status`;

  for (const rawTo of recipients) {
    const to = toE164(rawTo);
    const result = await sendSms({ to, body, statusCallbackUrl });
    await db.insert(dealMessages).values({
      conversationId,
      direction: "outbound",
      body,
      fromNumber: result.from,
      toNumber: to,
      sentByUserId,
      twilioSid: result.sid,
      status: result.status,
    });
  }

  await db.update(dealConversations).set({ lastMessageAt: new Date() }).where(eq(dealConversations.id, conversationId));
}

/** Adds an ad-hoc extra recipient (a co-signer, a spouse) to one conversation — not a permanent deal field, see the plan doc. */
export async function addConversationParticipant(conversationId: string, formData: FormData) {
  await requireUser();
  const name = str(formData, "name") || null;
  const phone = str(formData, "phone");
  if (!phone) throw new Error("Phone number is required");

  await db.insert(dealConversationParticipants).values({ conversationId, name, phone });
  revalidatePath(`/deals`);
  revalidatePath("/inbox");
}

export async function removeConversationParticipant(participantId: string) {
  await requireUser();
  await db.delete(dealConversationParticipants).where(eq(dealConversationParticipants.id, participantId));
  revalidatePath(`/deals`);
  revalidatePath("/inbox");
}

/** Inbox: every conversation not (yet) attached to a deal, most recent first. */
export async function getUnmatchedConversations() {
  await requireUser();
  return db.query.dealConversations.findMany({
    where: isNull(dealConversations.dealId),
    with: {
      messages: { orderBy: desc(dealMessages.createdAt), limit: 1 },
      participants: true,
      callLogs: { orderBy: (c, { desc: descC }) => descC(c.startedAt), limit: 1 },
    },
    orderBy: desc(dealConversations.lastMessageAt),
  });
}

/** Attaches an Inbox conversation to an existing deal — an existing borrower who called/texted from a number that wasn't on file. */
export async function attachConversationToDeal(conversationId: string, formData: FormData) {
  await requireUser();
  const dealId = str(formData, "dealId");
  if (!dealId) throw new Error("Choose a deal to attach this to");
  await db.update(dealConversations).set({ dealId }).where(eq(dealConversations.id, conversationId));
  revalidatePath("/inbox");
  revalidatePath(`/deals/${dealId}`);
}

/** Un-attaches (back to the Inbox) — for the rare mis-click. */
export async function detachConversationFromDeal(conversationId: string) {
  await requireUser();
  await db.update(dealConversations).set({ dealId: null }).where(eq(dealConversations.id, conversationId));
  revalidatePath("/inbox");
}
