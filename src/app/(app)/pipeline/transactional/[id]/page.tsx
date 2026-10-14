import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requireAdminOrLoanOfficer } from "@/server/auth/guards";
import { db } from "@/server/db/client";
import { transactionalLoans } from "@/server/db/schema";
import { TransactionalDetail } from "@/components/transactional/transactional-detail";

export default async function TransactionalLoanPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdminOrLoanOfficer();
  const { id } = await params;

  const [loan, lenders] = await Promise.all([
    db.query.transactionalLoans.findFirst({ where: eq(transactionalLoans.id, id), with: { lender: true } }),
    db.query.transactionalLenders.findMany({ orderBy: (l, { asc }) => asc(l.name) }),
  ]);
  if (!loan) notFound();

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link href="/pipeline/transactional" className="text-sm text-muted-foreground underline hover:text-foreground">
        ← Transactional pipeline
      </Link>
      <TransactionalDetail
        isAdmin={user.isAdmin}
        lenderName={loan.lender?.name ?? null}
        lenders={lenders.map((l) => ({ id: l.id, name: l.name }))}
        loan={{
          id: loan.id,
          propertyAddress: loan.propertyAddress,
          fundingAmount: Number(loan.fundingAmount),
          closingDate: loan.closingDate ? loan.closingDate.toISOString().slice(0, 10) : null,
          borrowerName: loan.borrowerName,
          borrowerPhone: loan.borrowerPhone,
          borrowerEmail: loan.borrowerEmail,
          titleCompanyName: loan.titleCompanyName,
          titleAgentName: loan.titleAgentName,
          titlePhone: loan.titlePhone,
          titleEmail: loan.titleEmail,
          sameDayFunding: loan.sameDayFunding,
          brokerPoints: loan.brokerPoints === null ? null : Number(loan.brokerPoints),
          stage: loan.stage,
          lostReason: loan.lostReason,
          transactionalLenderId: loan.transactionalLenderId,
          sentToLenderAt: loan.sentToLenderAt ? loan.sentToLenderAt.toISOString() : null,
        }}
      />
    </div>
  );
}
