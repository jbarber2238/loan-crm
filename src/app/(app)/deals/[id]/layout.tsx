import { notFound } from "next/navigation";
import { getDealDetail } from "@/server/data/deal-detail";
import { requireUser } from "@/server/auth/guards";
import { DealHeader } from "@/components/deals/deal-header";
import { DealLifecycleBanner } from "@/components/deals/deal-lifecycle-banner";
import { ClearToCloseEmailBanner } from "@/components/deals/clear-to-close-email-banner";
import { DealPhoneBar } from "@/components/deals/deal-phone-bar";
import { LatestUpdateBanner } from "@/components/deals/latest-update-banner";
import { getLatestUpdate } from "@/server/tasks";

export default async function DealDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const deal = await getDealDetail(id);
  if (!deal) notFound();

  // A deleted deal is invisible to everyone except an admin — see
  // deleteDeal/restoreDeletedDeal. Not found (not "access denied") so a
  // deleted deal's URL reveals nothing to a non-admin who has it.
  if (deal.deletedAt && !user.isAdmin) notFound();

  const latestUpdate = await getLatestUpdate(id);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <DealLifecycleBanner deal={deal} />
      <ClearToCloseEmailBanner deal={deal} />
      <DealHeader deal={deal} />
      <LatestUpdateBanner dealId={deal.id} userId={user.id} update={latestUpdate} />
      {children}
      <DealPhoneBar dealId={deal.id} />
    </div>
  );
}
