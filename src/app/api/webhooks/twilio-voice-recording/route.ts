import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { dealCallLogs } from "@/server/db/schema";
import { canonicalWebhookUrl, twimlResponse, verifiedTwilioParams } from "@/server/twilio-client";

// Twilio's <Record> completion callback (see twilio-voice/route.ts) — a
// missed inbound call's voicemail. Just stores the recording URL/duration on
// the existing call-log row; no transcription yet (fast-follow if wanted).
export async function POST(request: Request) {
  let params: Record<string, string>;
  try {
    params = await verifiedTwilioParams(request);
  } catch (err) {
    console.error("Twilio voicemail-recording webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 401 });
  }

  const url = new URL(canonicalWebhookUrl(request));
  const callLogId = url.searchParams.get("callLogId");
  if (!callLogId) return twimlResponse("");

  const durationSeconds = params.RecordingDuration ? parseInt(params.RecordingDuration, 10) : undefined;
  await db
    .update(dealCallLogs)
    .set({ endedAt: new Date(), durationSeconds, recordingUrl: params.RecordingUrl })
    .where(eq(dealCallLogs.id, callLogId));

  return twimlResponse("<Hangup/>");
}
