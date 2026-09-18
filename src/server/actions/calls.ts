"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { dealCallLogs, dealConversations, users } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { initiateBridgeCall } from "@/server/twilio-client";
import { getOrCreateConversationForDeal } from "@/server/conversations";
import { getEffectiveOutboundWindow, isWithinWindow } from "@/server/phone-routing";

function baseUrl() {
  return process.env.APP_URL ?? "http://localhost:3000";
}

/**
 * Click-to-call bridge (see the plan doc): dials the calling staff member's
 * own phone (from My Profile), and once they pick up, Twilio requests the
 * connect webhook, which dials the conversation's other party and bridges
 * the two calls — that party always sees the shared company number, never
 * the staff member's own. Blocked outside the staff member's effective
 * outbound window (their own preference, clamped to the org's TCPA-safe
 * ceiling).
 */
async function bridgeCallForConversation(conversation: { id: string; primaryPhone: string }) {
  const sessionUser = await requireUser();
  const user = await db.query.users.findFirst({
    where: eq(users.id, sessionUser.id),
    columns: { id: true, phone: true, outboundHoursStart: true, outboundHoursEnd: true },
  });
  if (!user?.phone) {
    throw new Error("Add your own phone number in My Profile before making calls.");
  }

  const window = await getEffectiveOutboundWindow(user.outboundHoursStart, user.outboundHoursEnd);
  if (!isWithinWindow(window.start, window.end, new Date())) {
    throw new Error(`Outside your outbound calling hours (${window.start.slice(0, 5)}–${window.end.slice(0, 5)}).`);
  }

  const connectUrl = `${baseUrl()}/api/webhooks/twilio-voice-connect?to=${encodeURIComponent(conversation.primaryPhone)}`;
  const statusCallbackUrl = `${baseUrl()}/api/webhooks/twilio-call-status`;

  const call = await initiateBridgeCall({ staffPhone: user.phone, connectTwimlUrl: connectUrl, statusCallbackUrl });

  await db.insert(dealCallLogs).values({
    conversationId: conversation.id,
    direction: "outbound",
    initiatedByUserId: user.id,
    counterpartyNumber: conversation.primaryPhone,
    status: "ringing",
    twilioCallSid: call.sid,
  });
}

export async function initiateDealCall(dealId: string) {
  const conversation = await getOrCreateConversationForDeal(dealId);
  await bridgeCallForConversation(conversation);
  revalidatePath(`/deals/${dealId}/messages`);
}

/** Same bridge, for calling back an Inbox conversation not (yet) tied to a deal. */
export async function initiateConversationCall(conversationId: string) {
  const conversation = await db.query.dealConversations.findFirst({ where: eq(dealConversations.id, conversationId) });
  if (!conversation) throw new Error("Conversation not found");
  await bridgeCallForConversation(conversation);
  revalidatePath(`/inbox/${conversationId}`);
}
