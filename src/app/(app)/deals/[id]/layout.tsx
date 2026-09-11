import { notFound } from "next/navigation";
import { getDealDetail } from "@/server/data/deal-detail";
import { expireStaleFollowUps } from "@/server/deal-stage-automation";
import { DealHeader } from "@/components/deals/deal-header";

export default async function DealDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await expireStaleFollowUps();
  const deal = await getDealDetail(id);
  if (!deal) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <DealHeader deal={deal} />
      {children}
    </div>
  );
}
