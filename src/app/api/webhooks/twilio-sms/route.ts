import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { dealConversations, dealMessages } from "@/server/db/schema";
import { verifiedTwilioParams, twimlResponse } from "@/server/twilio-client";
import { activeAdminIds, createNotifications, dealTeamUserIds } from "@/server/notifications";
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

  try {
    const preview = body.length > 120 ? `${body.slice(0, 120)}…` : body;
    const team = conversation.dealId ? await dealTeamUserIds(conversation.dealId) : null;
    if (team && conversation.dealId) {
      await createNotifications(team.userIds, {
        type: "inbound_text",
        title: `New text on ${team.propertyAddress}`,
        body: preview,
        href: `/deals/${conversation.dealId}/messages`,
        dealId: conversation.dealId,
      });
    } else {
      await createNotifications(await activeAdminIds(), {
        type: "inbound_text",
        title: `New text from ${from}`,
        body: preview,
        href: "/inbox",
      });
    }
  } catch (err) {
    console.error("Failed to create inbound-text notification:", err);
  }

  // Empty <Response/> — no auto-reply. STOP/HELP keywords are handled by
  // Twilio's Advanced Opt-Out feature at the number level, before this
  // webhook even fires, once enabled in the Twilio console.
  return twimlResponse("");
}
