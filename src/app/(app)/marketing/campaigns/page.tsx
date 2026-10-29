import { requireAdmin } from "@/server/auth/guards";
import { getMarketingOverview } from "@/server/marketing-email";
import { loadAllPeople } from "@/server/marketing-audience";
import { loadCampaignStats, loadCampaigns } from "@/server/marketing-campaigns";
import { MarketingEmailPanel } from "@/components/marketing/marketing-email-panel";
import { CampaignList } from "@/components/marketing/campaign-list";
import { audienceOptions } from "@/lib/marketing-audience";

export const dynamic = "force-dynamic";

export default async function EmailCampaignsPage() {
  await requireAdmin();
  // In steps, not all at once: each of these fans out into several queries, and together they used up the
  // database's connection pool, so the page hung until it timed out.
  const groups = await getMarketingOverview();
  const people = await loadAllPeople();
  const [campaigns, stats] = await Promise.all([loadCampaigns(), loadCampaignStats()]);
  const options = audienceOptions(people);
  return (
    <MarketingEmailPanel
      groups={groups}
      campaignsCount={campaigns.length}
      campaigns={
        <CampaignList
          campaigns={campaigns.map((c) => ({
            id: c.id,
            name: c.name,
            subject: c.subject,
            status: c.status,
            schedule: c.schedule,
            audienceLabel: options.find((o) => o.key === c.audienceKey)?.label ?? "An audience that no longer exists",
            nextRunAt: c.nextRunAt?.toISOString() ?? null,
            lastRunAt: c.lastRunAt?.toISOString() ?? null,
            runCount: c.runCount,
            pauseReason: c.pauseReason,
            stats: stats.get(c.id) ?? { queued: 0, sent: 0, failed: 0, skipped: 0, clicked: 0, bounced: 0, unsubscribed: 0 },
          }))}
        />
      }
    />
  );
}
