import Link from "next/link";
import { isNotNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { RestoreArchivedDealButton } from "@/components/deals/restore-archived-deal-button";
import { Card, CardContent } from "@/components/ui/card";
import { labelFor, LOAN_CATEGORIES } from "@/lib/labels";

function money(value: string): string {
  return `$${Number(value).toLocaleString()}`;
}

function ArchivedDealRow({
  deal,
}: {
  deal: {
    id: string;
    loanNumber: number;
    borrowerName: string;
    propertyAddress: string;
    loanAmountRequested: string;
    loanCategory: string;
    archivedAt: Date | null;
    archivedByUser: { name: string | null; email: string | null } | null;
  };
}) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div>
          <p className="text-[10px] font-medium text-muted-foreground tracking-wide">Loan #{deal.loanNumber}</p>
          <Link href={`/deals/${deal.id}`} className="font-medium hover:underline">
            {deal.propertyAddress}
          </Link>
          <p className="text-xs text-muted-foreground">
            {deal.borrowerName} · {labelFor(LOAN_CATEGORIES, deal.loanCategory)} · {money(deal.loanAmountRequested)}
          </p>
          <p className="text-xs text-muted-foreground">
            Archived {deal.archivedAt?.toLocaleDateString()}
            {deal.archivedByUser?.name ? ` by ${deal.archivedByUser.name}` : " automatically"}
          </p>
        </div>
        <RestoreArchivedDealButton dealId={deal.id} />
      </CardContent>
    </Card>
  );
}

export default async function ArchivedDealsPage() {
  await requireUser();

  const archived = await db.query.deals.findMany({
    where: isNotNull(deals.archivedAt),
    with: { archivedByUser: true },
    orderBy: (deals, { desc }) => desc(deals.archivedAt),
  });

  const closed = archived.filter((d) => d.stage === "closed");
  const lost = archived.filter((d) => d.stage === "lost");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Archived Deals</h1>
          <p className="text-sm text-muted-foreground">
            Off the live Pipeline board, but still fully on file — nothing here is deleted.
          </p>
        </div>
        <Link href="/pipeline" className="text-sm text-muted-foreground underline hover:text-foreground">
          Back to Pipeline
        </Link>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Closed ({closed.length})
        </h2>
        <div className="space-y-2">
          {closed.map((deal) => (
            <ArchivedDealRow key={deal.id} deal={deal} />
          ))}
          {closed.length === 0 && <p className="text-sm text-muted-foreground">No archived closed deals.</p>}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Lost ({lost.length})</h2>
        <div className="space-y-2">
          {lost.map((deal) => (
            <ArchivedDealRow key={deal.id} deal={deal} />
          ))}
          {lost.length === 0 && <p className="text-sm text-muted-foreground">No archived lost deals.</p>}
        </div>
      </div>
    </div>
  );
}
