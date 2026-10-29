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
  const [groups, campaigns, stats, people] = await Promise.all([getMarketingOverview(), loadCampaigns(), loadCampaignStats(), loadAllPeople()]);
  const options = audienceOptions(people);
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Your campaigns</h2>
          <p className="text-sm text-muted-foreground">Emails you built in the Email Builder: where each one stands, who got it and who clicked.</p>
        </div>
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
            stats: stats.get(c.id) ?? { queued: 0, sent: 0, failed: 0, skipped: 0, clicked: 0 },
          }))}
        />
      </section>
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Automatic emails</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Every automated email in one place: who gets it, when it goes out, and whether it&apos;s on. Switch an email off to stop it, change a time to move it, or open the wording to edit it. All times are
            Eastern.
          </p>
        </div>
        <MarketingEmailPanel groups={groups} />
      </section>
    </div>
  );
}
