import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { dealMessages } from "@/server/db/schema";
import { verifiedTwilioParams, twimlResponse } from "@/server/twilio-client";

// Twilio's delivery-status callback for an outbound message (queued -> sent
// -> delivered, or failed/undelivered) — set via statusCallback on the send
// itself (see sendSms in src/server/twilio-client.ts), not a number-level
// webhook setting.
export async function POST(request: Request) {
  let params: Record<string, string>;
  try {
    params = await verifiedTwilioParams(request);
  } catch (err) {
    console.error("Twilio SMS status webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 401 });
  }

  const messageSid = params.MessageSid;
  const status = params.MessageStatus;
  if (messageSid && status) {
    await db.update(dealMessages).set({ status }).where(eq(dealMessages.twilioSid, messageSid));
  }

  return twimlResponse("");
}
