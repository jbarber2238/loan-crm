import { sendDueSurveyReminders } from "@/server/closing-survey";

// Once a day: sends any closing-survey reminder that has come due (days 3, 7, 14, 21 and 30
// after closing). The first email goes out the moment a deal is marked Closed, not from here.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json(await sendDueSurveyReminders());
}
