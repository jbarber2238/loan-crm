import { runPartnerDailyJobs } from "@/server/partner/cron";

// Once a day: signup nudges (day 2/5), payment-detail reminders (day 3/7),
// quiet-partner alerts (45 days) and the tier review. Partner emails still
// obey the program-live switch inside sendPartnerEmail.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json(await runPartnerDailyJobs());
}
