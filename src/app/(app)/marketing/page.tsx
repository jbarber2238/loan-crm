import { requireAdmin } from "@/server/auth/guards";
import { getMarketingOverview } from "@/server/marketing-email";
import { MarketingEmailPanel } from "@/components/marketing/marketing-email-panel";

export default async function MarketingEmailPage() {
  await requireAdmin();
  const groups = await getMarketingOverview();
  return (
    <div className="space-y-5">
      <div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Every automated email in one place: who gets it, when it goes out, and whether it&apos;s on. Switch an email off to stop it, change a time to move it,
          or open the wording to edit it. All times are Eastern.
        </p>
      </div>
      <MarketingEmailPanel groups={groups} />
    </div>
  );
}
