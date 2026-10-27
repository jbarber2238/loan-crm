import Link from "next/link";
import { requireAdminOrLoanOfficer } from "@/server/auth/guards";
import { db } from "@/server/db/client";
import { PipelineTabs } from "@/components/board/pipeline-tabs";
import { TransactionalBoard, type BoardLoan } from "@/components/board/transactional-board";
import { CopyTransactionalLinkButton } from "@/components/transactional/copy-transactional-link-button";
import { transactionalFees } from "@/lib/transactional-fees";
import { autoArchiveStaleTransactionalLoans, purgeExpiredDeletedTransactionalLoans } from "@/server/transactional-automation";
import { and, isNull } from "drizzle-orm";
import { transactionalLoans } from "@/server/db/schema";

export default async function TransactionalPipelinePage() {
  await requireAdminOrLoanOfficer();
  await autoArchiveStaleTransactionalLoans();
  await purgeExpiredDeletedTransactionalLoans();
  // Archived and deleted requests are off the board (and out of its totals).
  const rows = await db.query.transactionalLoans.findMany({
    where: and(isNull(transactionalLoans.archivedAt), isNull(transactionalLoans.deletedAt)),
    orderBy: (l, { desc }) => desc(l.createdAt),
  });

  const loans: BoardLoan[] = rows.map((row) => {
    const fees = transactionalFees({
      fundingAmount: Number(row.fundingAmount),
      brokerPoints: row.brokerPoints === null ? null : Number(row.brokerPoints),
      sameDayFunding: row.sameDayFunding,
    });
    return {
      id: row.id,
      propertyAddress: row.propertyAddress,
      fundingAmount: Number(row.fundingAmount),
      closingDate: row.closingDate ? row.closingDate.toISOString() : null,
      stage: row.stage,
      borrowerName: row.borrowerName,
      createdAt: row.createdAt.toISOString(),
      stageChangedAt: row.stageChangedAt.toISOString(),
      sameDayFunding: row.sameDayFunding,
      leadValue: fees.brokerFee,
      totalFee: fees.totalFee,
      totalPoints: fees.totalPoints,
    };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Pipeline</h1>
          <Link href="/pipeline/transactional/archived" className="text-sm text-muted-foreground underline hover:text-foreground">
            View Archived Requests
          </Link>
          <Link href="/lenders" className="text-sm text-muted-foreground underline hover:text-foreground">
            Transactional lenders
          </Link>
        </div>
        <CopyTransactionalLinkButton />
      </div>
      <div data-board-toolbar className="space-y-4">
        <PipelineTabs showLeads />
      </div>
      <TransactionalBoard loans={loans} />
    </div>
  );
}
