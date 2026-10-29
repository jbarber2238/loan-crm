import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { marketingCampaignSends, marketingCampaigns, marketingContactTags } from "@/server/db/schema";
import { CAMPAIGN_BUTTONS, campaignTags } from "@/lib/campaign-email";

// A button in a campaign email points here so the click can be counted, then sends the reader on. Only the fixed
// buttons in CAMPAIGN_BUTTONS can be reached, so this can't be used to bounce people to an arbitrary address.
export async function GET(_request: Request, { params }: { params: Promise<{ sendId: string; button: string }> }) {
  const { sendId, button } = await params;
  const target = CAMPAIGN_BUTTONS[button];
  if (!target) return new Response("Not found", { status: 404 });
  const url = new URL(target.path);
  if (/^[0-9a-f-]{36}$/i.test(sendId)) {
    try {
      const send = await db.query.marketingCampaignSends.findFirst({ where: eq(marketingCampaignSends.id, sendId) });
      if (send) {
        if (!send.clickedAt) await db.update(marketingCampaignSends).set({ clickedAt: new Date() }).where(eq(marketingCampaignSends.id, sendId));
        const campaign = await db.query.marketingCampaigns.findFirst({ where: eq(marketingCampaigns.id, send.campaignId) });
        if (campaign) {
          await db.insert(marketingContactTags).values({ email: send.email, tag: campaignTags(campaign.name, campaign.tagRecipients).clicked }).onConflictDoNothing();
          url.searchParams.set("cid", send.campaignId);
        }
      }
    } catch (err) {
      console.error("Campaign click tracking failed:", err);
    }
  }
  return Response.redirect(url.toString(), 302);
}
