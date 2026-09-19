import { notFound } from "next/navigation";
import { getDealDetail } from "@/server/data/deal-detail";
import { expireStaleFollowUps, autoArchiveStaleDeals, purgeExpiredDeletedDeals } from "@/server/deal-stage-automation";
import { requireUser } from "@/server/auth/guards";
import { DealHeader } from "@/components/deals/deal-header";
import { DealLifecycleBanner } from "@/components/deals/deal-lifecycle-banner";

export default async function DealDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  await expireStaleFollowUps();
  await autoArchiveStaleDeals();
  await purgeExpiredDeletedDeals();
  const deal = await getDealDetail(id);
  if (!deal) notFound();

  // A deleted deal is invisible to everyone except an admin — see
  // deleteDeal/restoreDeletedDeal. Not found (not "access denied") so a
  // deleted deal's URL reveals nothing to a non-admin who has it.
  if (deal.deletedAt && !user.isAdmin) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <DealLifecycleBanner deal={deal} />
      <DealHeader deal={deal} />
      {children}
    </div>
  );
}
