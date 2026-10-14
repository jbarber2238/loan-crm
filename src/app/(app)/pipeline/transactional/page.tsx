import Link from "next/link";
import { requireAdminOrLoanOfficer } from "@/server/auth/guards";
import { db } from "@/server/db/client";
import { PipelineTabs } from "@/components/board/pipeline-tabs";
import { TransactionalBoard, type BoardLoan } from "@/components/board/transactional-board";
import { CopyTransactionalLinkButton } from "@/components/transactional/copy-transactional-link-button";
import { transactionalFees } from "@/lib/transactional-fees";

export default async function TransactionalPipelinePage() {
  await requireAdminOrLoanOfficer();
  const rows = await db.query.transactionalLoans.findMany({ orderBy: (l, { desc }) => desc(l.createdAt) });

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
          <Link href="/lenders" className="text-sm text-muted-foreground underline hover:text-foreground">
            Transactional lenders
          </Link>
        </div>
        <CopyTransactionalLinkButton />
      </div>
      <PipelineTabs showLeads />
      <TransactionalBoard loans={loans} />
    </div>
  );
}
