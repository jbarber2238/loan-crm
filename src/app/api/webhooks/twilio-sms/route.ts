import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { dealConversations, dealMessages } from "@/server/db/schema";
import { verifiedTwilioParams, twimlResponse } from "@/server/twilio-client";
import { findOrCreateConversationForInbound } from "@/server/conversations";

// Twilio calls this for every inbound SMS to the shared company number.
// Configure it as the number's "A message comes in" webhook. Matches (or
// creates) a conversation by the sender's phone — see findOrCreateConversationForInbound
// for the "existing deal / ad-hoc participant / unmatched" resolution order.
export async function POST(request: Request) {
  let params: Record<string, string>;
  try {
    params = await verifiedTwilioParams(request);
  } catch (err) {
    console.error("Twilio SMS webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 401 });
  }

  const from = params.From;
  const to = params.To;
  const body = params.Body ?? "";
  const messageSid = params.MessageSid;
  if (!from) return twimlResponse("");

  const conversation = await findOrCreateConversationForInbound(from);

  await db.insert(dealMessages).values({
    conversationId: conversation.id,
    direction: "inbound",
    body,
    fromNumber: from,
    toNumber: to,
    twilioSid: messageSid,
  });
  await db.update(dealConversations).set({ lastMessageAt: new Date() }).where(eq(dealConversations.id, conversation.id));

  // Empty <Response/> — no auto-reply. STOP/HELP keywords are handled by
  // Twilio's Advanced Opt-Out feature at the number level, before this
  // webhook even fires, once enabled in the Twilio console.
  return twimlResponse("");
}
