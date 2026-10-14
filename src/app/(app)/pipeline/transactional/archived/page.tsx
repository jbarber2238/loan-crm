import Link from "next/link";
import { and, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import { transactionalLoans } from "@/server/db/schema";
import { requireAdminOrLoanOfficer } from "@/server/auth/guards";
import { RestoreTransactionalButton } from "@/components/transactional/restore-transactional-button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDay, formatMoney } from "@/lib/transactional-shared";

type Row = Awaited<ReturnType<typeof loadArchived>>[number];

function loadArchived() {
  return db.query.transactionalLoans.findMany({
    where: and(isNotNull(transactionalLoans.archivedAt), isNull(transactionalLoans.deletedAt)),
    with: { archivedByUser: true },
    orderBy: (l, { desc }) => desc(l.archivedAt),
  });
}

function ArchivedRow({ loan }: { loan: Row }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div>
          <Link href={`/pipeline/transactional/${loan.id}`} className="font-medium hover:underline">
            {loan.propertyAddress}
          </Link>
          <p className="text-xs text-muted-foreground">
            {loan.borrowerName ?? "—"} · {formatMoney(Number(loan.fundingAmount))} · Closing {formatDay(loan.closingDate)}
          </p>
          <p className="text-xs text-muted-foreground">
            Archived {loan.archivedAt?.toLocaleDateString()}
            {loan.archivedByUser?.name ? ` by ${loan.archivedByUser.name}` : " automatically"}
          </p>
        </div>
        <RestoreTransactionalButton loanId={loan.id} kind="archived" />
      </CardContent>
    </Card>
  );
}

export default async function ArchivedTransactionalPage() {
  await requireAdminOrLoanOfficer();
  const archived = await loadArchived();
  const closed = archived.filter((l) => l.stage === "closed");
  const lost = archived.filter((l) => l.stage === "lost");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Archived Transactional Requests</h1>
          <p className="text-sm text-muted-foreground">
            Off the Transactional board, but still fully on file — nothing here is deleted.
          </p>
        </div>
        <Link href="/pipeline/transactional" className="text-sm text-muted-foreground underline hover:text-foreground">
          Back to Transactional
        </Link>
      </div>

      {[
        { label: "Closed", rows: closed },
        { label: "Lost", rows: lost },
      ].map(({ label, rows }) => (
        <div key={label} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {label} ({rows.length})
          </h2>
          <div className="space-y-2">
            {rows.map((loan) => (
              <ArchivedRow key={loan.id} loan={loan} />
            ))}
            {rows.length === 0 && <p className="text-sm text-muted-foreground">No archived {label.toLowerCase()} requests.</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
