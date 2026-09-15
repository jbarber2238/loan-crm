import { notFound } from "next/navigation";
import { db } from "@/server/db/client";
import { getDealDetail } from "@/server/data/deal-detail";
import { requireUser } from "@/server/auth/guards";
import { getEmailRecipientCandidates } from "@/server/email-recipient-candidates";
import { PricingTab } from "@/components/deals/pricing-tab";

export default async function DealPricingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const deal = await getDealDetail(id);
  if (!deal) notFound();

  const [allLenders, allProducts, candidates] = await Promise.all([
    db.query.lenders.findMany({ with: { reps: true }, orderBy: (l, { asc }) => asc(l.name) }),
    db.query.products.findMany({
      where: (products, { eq }) => eq(products.active, true),
      with: { lender: true },
      orderBy: (p, { asc }) => asc(p.name),
    }),
    getEmailRecipientCandidates(id, { includeAllStaff: true }),
  ]);

  return (
    <PricingTab
      dealId={deal.id}
      lenders={allLenders}
      requests={deal.pricingRequests}
      pricingNoteToRep={deal.pricingNoteToRep}
      loanCategory={deal.loanCategory}
      signatureHtml={user.emailSignatureHtml ?? ""}
      candidates={candidates}
      products={allProducts.map((p) => ({
        id: p.id,
        name: `${p.lender.name} — ${p.name}`,
        category: p.category,
        lenderId: p.lenderId,
      }))}
      purchasePrice={deal.purchasePrice ? Number(deal.purchasePrice) : null}
      estimatedAsIsValue={deal.estimatedAsIsValue ? Number(deal.estimatedAsIsValue) : null}
    />
  );
}
