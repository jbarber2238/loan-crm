"use server";

import { desc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { dealConversations, dealConversationParticipants, dealMessages } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { sendSms } from "@/server/twilio-client";
import { getOrCreateConversationForDeal } from "@/server/conversations";

function baseUrl() {
  return process.env.APP_URL ?? "http://localhost:3000";
}

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Sends one outbound SMS on a deal's conversation (creating the conversation
 * on first use) — always from the shared company number. Recipients: the
 * conversation's primary phone plus any ad-hoc participants added to it,
 * each getting the same message as a separate send (Twilio has no native
 * "group MMS" for a standard long code the way iMessage does).
 */
export async function sendDealMessage(dealId: string, formData: FormData) {
  const user = await requireUser();
  const body = str(formData, "body");
  if (!body) throw new Error("Message can't be empty");

  const conversation = await getOrCreateConversationForDeal(dealId);
  await sendToConversation(conversation.id, body, user.id);

  revalidatePath(`/deals/${dealId}/messages`);
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

  for (const to of recipients) {
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
  revalidatePath(`/deals/${dealId}/messages`);
}

/** Un-attaches (back to the Inbox) — for the rare mis-click. */
export async function detachConversationFromDeal(conversationId: string) {
  await requireUser();
  await db.update(dealConversations).set({ dealId: null }).where(eq(dealConversations.id, conversationId));
  revalidatePath("/inbox");
}
