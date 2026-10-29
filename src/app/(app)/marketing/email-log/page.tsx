import { requireAdmin } from "@/server/auth/guards";
import { sender } from "@/server/friday";
import { dailyHistory, loadCapSnapshot } from "@/server/send-limits";
import { loadCampaignStats, loadCampaigns } from "@/server/marketing-campaigns";
import { loadCampaignSends, loadOtherEmails } from "@/server/email-log-view";
import { checkEmailAuth } from "@/server/email-auth";
import { EmailLog } from "@/components/marketing/email-log";
import { campaignHealth } from "@/lib/send-limits";

export const dynamic = "force-dynamic";

export default async function EmailLogPage() {
  await requireAdmin();
  const from = await sender();
  if (!from) return <p className="text-sm text-muted-foreground">No sending account is set up yet.</p>;
  // One step at a time: each of these runs several queries, and together they can use up the connection pool.
  const snapshot = await loadCapSnapshot(from.id);
  const history = await dailyHistory(from.id);
  const campaigns = await loadCampaigns();
  const stats = await loadCampaignStats();
  const sends = await loadCampaignSends();
  const others = await loadOtherEmails(from.id);
  const auth = await checkEmailAuth(from.email);
  return (
    <EmailLog
      senderEmail={from.email}
      cap={{ used24h: snapshot.used24h, dailyLimit: snapshot.dailyLimit, campaignUsed24h: snapshot.campaignUsed24h, campaignDailyMax: snapshot.campaignDailyMax, level: snapshot.status.level, pct: snapshot.status.pct, campaignRoom: snapshot.status.campaignRoom, hardStop: snapshot.status.hardStop }}
      limits={snapshot.limits}
      history={history}
      auth={auth}
      campaigns={campaigns.map((c) => {
        const s = stats.get(c.id) ?? { queued: 0, sent: 0, failed: 0, skipped: 0, clicked: 0, bounced: 0, unsubscribed: 0 };
        return { id: c.id, name: c.name, status: c.status, pauseReason: c.pauseReason, lastRunAt: c.lastRunAt?.toISOString() ?? null, stats: s, health: campaignHealth(s) };
      })}
      sends={sends}
      others={others}
    />
  );
}
