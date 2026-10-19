import { runFridayJobs } from "@/server/friday";

// Every 15 minutes: the Friday headcount and reminder, attendance from Zoom
// after the session, the 3 PM follow-up, the +3-day nudge, and Saturday's
// rebook. Each email is claimed in friday_sends, so repeated runs never double-send.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json(await runFridayJobs());
}
