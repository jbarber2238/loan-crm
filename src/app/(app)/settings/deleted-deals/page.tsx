import Link from "next/link";
import { isNotNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { Card, CardContent } from "@/components/ui/card";
import { RestoreDeletedDealButton } from "@/components/deals/restore-deleted-deal-button";
import { labelFor, LOAN_CATEGORIES } from "@/lib/labels";
import { DELETED_DEAL_PURGE_AFTER_DAYS } from "@/lib/deal-pipeline";

function money(value: string): string {
  return `$${Number(value).toLocaleString()}`;
}

function daysLeft(deletedAt: Date): number {
  const daysElapsed = Math.floor((Date.now() - deletedAt.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, DELETED_DEAL_PURGE_AFTER_DAYS - daysElapsed);
}

export default async function DeletedDealsPage() {
  await requireAdmin();

  const deleted = await db.query.deals.findMany({
    where: isNotNull(deals.deletedAt),
    with: { deletedByUser: true },
    orderBy: (deals, { desc }) => desc(deals.deletedAt),
  });

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div>
          <h2 className="text-base font-semibold">Deleted Deals</h2>
          <p className="text-sm text-muted-foreground">
            Only admins can see this. Anything here is permanently removed{" "}
            {DELETED_DEAL_PURGE_AFTER_DAYS} days after it was deleted — restore it before then or it&apos;s gone for
            good.
          </p>
        </div>
        <div className="space-y-2">
          {deleted.map((deal) => (
            <div key={deal.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
              <div>
                <p className="text-[10px] font-medium text-muted-foreground tracking-wide">Loan #{deal.loanNumber}</p>
                <Link href={`/deals/${deal.id}`} className="font-medium hover:underline">
                  {deal.propertyAddress}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {deal.borrowerName} · {labelFor(LOAN_CATEGORIES, deal.loanCategory)} · {money(deal.loanAmountRequested)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Deleted {deal.deletedAt?.toLocaleDateString()}
                  {deal.deletedByUser?.name ? ` by ${deal.deletedByUser.name}` : ""} —{" "}
                  {deal.deletedAt && (
                    <span className="font-medium text-destructive">
                      {daysLeft(deal.deletedAt)} day{daysLeft(deal.deletedAt) === 1 ? "" : "s"} left to restore
                    </span>
                  )}
                </p>
              </div>
              <RestoreDeletedDealButton dealId={deal.id} />
            </div>
          ))}
          {deleted.length === 0 && <p className="text-sm text-muted-foreground">Nothing here right now.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
