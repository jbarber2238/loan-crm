"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { dealCallLogs, dealConversations, users } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { initiateBridgeCall, toE164 } from "@/server/twilio-client";
import { getEffectiveOutboundWindow, isWithinWindow } from "@/server/phone-routing";
import { getOrCreateConversationForPhone } from "@/server/conversations";

function baseUrl() {
  return process.env.APP_URL ?? "http://localhost:3000";
}

export interface CallResult {
  ok: boolean;
  message?: string;
}

/**
 * Click-to-call bridge (see the plan doc): dials the calling staff member's
 * own phone (from My Profile), and once they pick up, Twilio requests the
 * connect webhook, which dials the conversation's other party and bridges
 * the two calls — that party always sees the shared company number, never
 * the staff member's own. Blocked outside the staff member's effective
 * outbound window (their own preference, clamped to the org's TCPA-safe
 * ceiling).
 *
 * Returns a result object rather than throwing for expected failures (no
 * phone on file, outside calling hours) — a thrown Error from a Server
 * Action gets reduced to an opaque digest on the client in production,
 * which is fine for a genuine bug but useless for "you're outside your own
 * hours right now," which the caller should just be told plainly.
 */
async function bridgeCallForConversation(conversation: { id: string; primaryPhone: string }): Promise<CallResult> {
  const sessionUser = await requireUser();
  const user = await db.query.users.findFirst({
    where: eq(users.id, sessionUser.id),
    columns: { id: true, phone: true, outboundHoursStart: true, outboundHoursEnd: true },
  });
  if (!user?.phone) {
    return { ok: false, message: "Add your own phone number in My Profile before making calls." };
  }

  const window = await getEffectiveOutboundWindow(user.outboundHoursStart, user.outboundHoursEnd);
  if (!isWithinWindow(window.start, window.end, new Date())) {
    return {
      ok: false,
      message: `Outside your outbound calling hours (${window.start.slice(0, 5)}–${window.end.slice(0, 5)} Eastern).`,
    };
  }

  const connectUrl = `${baseUrl()}/api/webhooks/twilio-voice-connect?to=${encodeURIComponent(conversation.primaryPhone)}`;
  const statusCallbackUrl = `${baseUrl()}/api/webhooks/twilio-call-status`;

  let call: Awaited<ReturnType<typeof initiateBridgeCall>>;
  try {
    call = await initiateBridgeCall({ staffPhone: toE164(user.phone), connectTwimlUrl: connectUrl, statusCallbackUrl });
  } catch (err) {
    console.error("Failed to initiate bridge call:", err);
    return { ok: false, message: "Couldn't start the call — check that Twilio is connected in Settings → Phone." };
  }

  await db.insert(dealCallLogs).values({
    conversationId: conversation.id,
    direction: "outbound",
    initiatedByUserId: user.id,
    counterpartyNumber: conversation.primaryPhone,
    status: "ringing",
    twilioCallSid: call.sid,
  });

  return { ok: true };
}

/** Same bridge, for calling back an Inbox conversation not (yet) tied to a deal. */
export async function initiateConversationCall(conversationId: string): Promise<CallResult> {
  const conversation = await db.query.dealConversations.findFirst({ where: eq(dealConversations.id, conversationId) });
  if (!conversation) return { ok: false, message: "Conversation not found" };
  const result = await bridgeCallForConversation(conversation);
  revalidatePath("/inbox");
  return result;
}

/** The Communications page's "Dial" tab — an arbitrary number that isn't necessarily any contact on file yet. Reuses the same shared-conversation-by-phone lookup as everything else, so if it turns out to match someone, it's already the right thread. */
export async function manualDialCall(formData: FormData): Promise<CallResult> {
  const raw = formData.get("phone");
  if (typeof raw !== "string" || !raw.trim()) {
    return { ok: false, message: "Enter a phone number" };
  }
  const conversation = await getOrCreateConversationForPhone(raw);
  return bridgeCallForConversation(conversation);
}
