import { sendClientNeedsAutoReminders } from "@/server/client-needs-auto-reminders";

// Checked hourly; each deal's own reminder interval/pause setting decides
// whether anything actually sends this run. See sendClientNeedsAutoReminders.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await sendClientNeedsAutoReminders();
  return Response.json(result);
}
