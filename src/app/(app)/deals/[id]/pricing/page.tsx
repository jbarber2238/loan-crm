import { notFound } from "next/navigation";
import { db } from "@/server/db/client";
import { getDealDetail } from "@/server/data/deal-detail";
import { PricingTab } from "@/components/deals/pricing-tab";

export default async function DealPricingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const deal = await getDealDetail(id);
  if (!deal) notFound();

  const [allLenders, allProducts] = await Promise.all([
    db.query.lenders.findMany({ with: { reps: true }, orderBy: (l, { asc }) => asc(l.name) }),
    db.query.products.findMany({
      where: (products, { eq }) => eq(products.active, true),
      with: { lender: true },
      orderBy: (p, { asc }) => asc(p.name),
    }),
  ]);

  return (
    <PricingTab
      dealId={deal.id}
      lenders={allLenders}
      requests={deal.pricingRequests}
      pricingNoteToRep={deal.pricingNoteToRep}
      loanCategory={deal.loanCategory}
      products={allProducts.map((p) => ({
        id: p.id,
        name: `${p.lender.name} — ${p.name}`,
        category: p.category,
        lenderId: p.lenderId,
      }))}
    />
  );
}
