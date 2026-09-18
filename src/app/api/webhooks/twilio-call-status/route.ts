import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { dealCallLogs } from "@/server/db/schema";
import { verifiedTwilioParams, twimlResponse } from "@/server/twilio-client";

const STATUS_MAP: Record<string, (typeof dealCallLogs.$inferSelect)["status"]> = {
  ringing: "ringing",
  "in-progress": "in_progress",
  completed: "completed",
  "no-answer": "no_answer",
  busy: "busy",
  failed: "failed",
  canceled: "failed",
};

// Twilio's call-status callback for the OUTBOUND leg of a click-to-call
// bridge (the call to the staff member's own phone) — set via
// statusCallback on call creation (see initiateBridgeCall in
// src/server/twilio-client.ts). Tracks the overall session's status/timing;
// the actual conversation only starts once this leg is answered and Twilio
// bridges in the borrower via twilio-voice-connect.
export async function POST(request: Request) {
  let params: Record<string, string>;
  try {
    params = await verifiedTwilioParams(request);
  } catch (err) {
    console.error("Twilio call-status webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 401 });
  }

  const callSid = params.CallSid;
  const twilioStatus = params.CallStatus;
  if (!callSid || !twilioStatus) return twimlResponse("");

  const status = STATUS_MAP[twilioStatus];
  if (!status) return twimlResponse("");

  const update: Partial<typeof dealCallLogs.$inferInsert> = { status };
  if (twilioStatus === "in-progress") update.answeredAt = new Date();
  if (twilioStatus === "completed" || twilioStatus === "no-answer" || twilioStatus === "busy" || twilioStatus === "failed") {
    update.endedAt = new Date();
    if (params.CallDuration) update.durationSeconds = parseInt(params.CallDuration, 10);
  }

  await db.update(dealCallLogs).set(update).where(eq(dealCallLogs.twilioCallSid, callSid));
  return twimlResponse("");
}
