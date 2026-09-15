import { notFound } from "next/navigation";
import { db } from "@/server/db/client";
import { requireUser } from "@/server/auth/guards";
import { getDealDetail } from "@/server/data/deal-detail";
import { TermSheetsTab } from "@/components/deals/term-sheets-tab";

export default async function DealTermSheetsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const deal = await getDealDetail(id);
  if (!deal) notFound();

  const allProducts = await db.query.products.findMany({
    where: (products, { eq }) => eq(products.active, true),
    with: { lender: true },
    orderBy: (p, { asc }) => asc(p.name),
  });

  return (
    <TermSheetsTab
      dealId={deal.id}
      termSheets={deal.termSheets}
      products={allProducts.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        lenderName: p.lender.name,
      }))}
      isAdmin={user.isAdmin}
      hasBorrowerEmail={Boolean(deal.borrowerEmail)}
      purchasePrice={deal.purchasePrice ? Number(deal.purchasePrice) : null}
      estimatedAsIsValue={deal.estimatedAsIsValue ? Number(deal.estimatedAsIsValue) : null}
    />
  );
}
