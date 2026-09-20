import { canonicalWebhookUrl, twimlResponse, verifiedTwilioParams, toE164 } from "@/server/twilio-client";
import { getTwilioSettings } from "@/server/settings";

// Twilio requests this once the staff member's own phone picks up on a
// click-to-call bridge (see bridgeCallForConversation in
// src/server/actions/calls.ts) — the response dials the borrower and
// bridges the two legs. callerId is set explicitly to the shared company
// number so the borrower's caller ID never shows anything else.
export async function POST(request: Request) {
  try {
    await verifiedTwilioParams(request);
  } catch (err) {
    console.error("Twilio voice-connect webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 401 });
  }

  const url = new URL(canonicalWebhookUrl(request));
  const to = url.searchParams.get("to");
  if (!to) return twimlResponse("<Say>Sorry, something went wrong connecting this call.</Say>");

  const settings = await getTwilioSettings();
  const callerId = settings?.phoneNumber ? toE164(settings.phoneNumber) : "";

  return twimlResponse(`<Dial callerId="${callerId}"><Number>${toE164(to)}</Number></Dial>`);
}
