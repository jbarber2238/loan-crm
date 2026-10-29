import { runMarketingCampaigns } from "@/server/marketing-campaigns";
import { runFollowUpReminders } from "@/server/follow-ups";

export const maxDuration = 60;

// Every 5 minutes: starts any marketing campaign run that's due and sends a few queued emails (each person is
// claimed in marketing_campaign_sends first, so repeated runs never double-send), and raises follow-up reminders.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const [campaigns, followUps] = await Promise.all([runMarketingCampaigns(), runFollowUpReminders()]);
  return Response.json({ campaigns, followUps });
}
