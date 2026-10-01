import { sendClientNeedsAutoReminders } from "@/server/client-needs-auto-reminders";

// Checked every 15 minutes so the fixed 7:00 AM ET send time (see
// REMINDER_HOUR_ET in client-needs-auto-reminders.ts) lands close to the
// actual minute rather than drifting to the top of the next hour; each
// deal's own reminder interval/pause setting decides whether anything
// actually sends this run. See sendClientNeedsAutoReminders.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await sendClientNeedsAutoReminders();
  return Response.json(result);
}
