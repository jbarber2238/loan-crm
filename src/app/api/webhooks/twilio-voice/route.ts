import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { dealCallLogs, dealConversations } from "@/server/db/schema";
import { canonicalWebhookUrl, twimlResponse, verifiedTwilioParams, toE164, xmlEscape } from "@/server/twilio-client";
import { getTwilioSettings } from "@/server/settings";
import { findOrCreateConversationForInbound } from "@/server/conversations";
import { loadDealForRouting, reachableCandidatesInOrder, resolveInboundRouteCandidates, resolveUnmatchedRouteUserIds } from "@/server/phone-routing";

function baseUrl() {
  return process.env.APP_URL ?? "http://localhost:3000";
}

// Deliberately shorter than a typical personal-cell voicemail pickup
// (usually ~20-30s / 4-6 rings) — if the staff member's own voicemail
// answers before this elapses, Twilio treats that as a completed call and
// this app's own company-greeting voicemail never gets a chance to run.
// 15s is enough time to actually reach for the phone, comfortably short of
// most carriers' default voicemail delay.
const RING_TIMEOUT_SECONDS = 15;

/**
 * Inbound call to the shared company number. Twilio hits this once when the
 * call comes in, then hits it again (with `i` incremented) every time a
 * `<Dial>` to one candidate finishes without connecting — see the `action`
 * URL below. The candidate list itself is re-resolved fresh on every hit
 * (deterministic given the deal + current time) rather than threaded through
 * the URL, so nothing needs to be persisted between attempts beyond the
 * call-log row and which index we're on.
 */
export async function POST(request: Request) {
  let params: Record<string, string>;
  try {
    params = await verifiedTwilioParams(request);
  } catch (err) {
    console.error("Twilio inbound-voice webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 401 });
  }

  const url = new URL(canonicalWebhookUrl(request));
  const i = Number(url.searchParams.get("i") ?? "0");
  let conversationId = url.searchParams.get("conversationId");
  let callLogId = url.searchParams.get("callLogId");

  if (!conversationId || !callLogId) {
    const from = params.From;
    const callSid = params.CallSid;
    if (!from) return twimlResponse("<Say>Sorry, we couldn't take your call. Please try again.</Say>");

    const conversation = await findOrCreateConversationForInbound(from);
    conversationId = conversation.id;
    const [callLog] = await db
      .insert(dealCallLogs)
      .values({ conversationId, direction: "inbound", counterpartyNumber: from, status: "ringing", twilioCallSid: callSid })
      .returning({ id: dealCallLogs.id });
    callLogId = callLog.id;
  }

  const conversation = await db.query.dealConversations.findFirst({ where: eq(dealConversations.id, conversationId) });
  const candidateUserIds = conversation?.dealId
    ? await (async () => {
        const deal = await loadDealForRouting(conversation.dealId!);
        return deal ? resolveInboundRouteCandidates(deal) : resolveUnmatchedRouteUserIds();
      })()
    : await resolveUnmatchedRouteUserIds();

  const reachable = await reachableCandidatesInOrder(candidateUserIds, new Date());

  if (i < reachable.length) {
    const target = reachable[i];
    const settings = await getTwilioSettings();
    const actionUrl = `${baseUrl()}/api/webhooks/twilio-voice?i=${i + 1}&conversationId=${conversationId}&callLogId=${callLogId}`;
    return twimlResponse(
      `<Dial timeout="${RING_TIMEOUT_SECONDS}" callerId="${settings?.phoneNumber ? toE164(settings.phoneNumber) : ""}" action="${xmlEscape(actionUrl)}"><Number>${toE164(target.phone!)}</Number></Dial>`
    );
  }

  // Nobody reachable (exhausted the list, or nobody's configured/within
  // hours at all) — voicemail.
  await db.update(dealCallLogs).set({ status: "voicemail" }).where(eq(dealCallLogs.id, callLogId));
  const recordingAction = `${baseUrl()}/api/webhooks/twilio-voice-recording?callLogId=${callLogId}`;
  return twimlResponse(
    `<Say>Thanks for calling. Everyone is unavailable right now — please leave a message after the tone.</Say><Record action="${xmlEscape(recordingAction)}" maxLength="120" playBeep="true" />`
  );
}
