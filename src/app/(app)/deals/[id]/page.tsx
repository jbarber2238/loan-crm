import { notFound } from "next/navigation";
import { getDealDetail } from "@/server/data/deal-detail";
import { OverviewTab } from "@/components/deals/overview-tab";

export default async function DealOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const deal = await getDealDetail(id);
  if (!deal) notFound();

  return <OverviewTab deal={deal} />;
}
