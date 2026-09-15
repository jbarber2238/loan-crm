import { notFound } from "next/navigation";
import { getDealDetail } from "@/server/data/deal-detail";
import { OverviewTab } from "@/components/deals/overview-tab";

// AI Quick Lender Match (triggered from this page) can render several PDF
// pages to images and send a multi-image vision request across every active
// lender in the category — on a category with several scanned-PDF matrices
// that can run past Vercel's default 10s function timeout, which is what
// produced a bare "Server Components render" error for a real user run.
// 60s is the Hobby plan's ceiling.
export const maxDuration = 60;

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
