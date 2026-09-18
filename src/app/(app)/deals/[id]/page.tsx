import { notFound } from "next/navigation";
import { getDealDetail } from "@/server/data/deal-detail";
import { OverviewTab } from "@/components/deals/overview-tab";

// AI Quick Lender Match (triggered from this page) can render several PDF
// pages to images and send a multi-image vision request across every active
// lender in the category — this originally needed its own maxDuration bump
// above Vercel's default, but now inherits the app-wide 120s ceiling set in
// the root layout instead, which covers this and every other route.

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
