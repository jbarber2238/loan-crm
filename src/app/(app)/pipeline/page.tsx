import { and, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { expireStaleFollowUps, autoArchiveStaleDeals, purgeExpiredDeletedDeals } from "@/server/deal-stage-automation";
import Link from "next/link";
import { KanbanBoard, type BoardDeal } from "@/components/board/kanban-board";
import { BoardFilters } from "@/components/board/board-filters";
import { BoardSearch } from "@/components/board/board-search";

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireUser();
  await expireStaleFollowUps();
  await autoArchiveStaleDeals();
  await purgeExpiredDeletedDeals();
  const params = await searchParams;

  const hasSearch = typeof params.q === "string" && params.q.trim().length > 0;

  // Deleted deals never appear here, full stop. Archived ones are hidden
  // from the normal board too — but a search should still be able to
  // surface one (with the KanbanBoard showing its "Archived" badge), since
  // "find that closed deal from three months ago" is exactly the kind of
  // thing search is for.
  const conditions = [isNull(deals.deletedAt)];
  if (!hasSearch) {
    conditions.push(isNull(deals.archivedAt));
  }
  if (typeof params.loanOfficerId === "string") {
    conditions.push(eq(deals.assignedLoanOfficerId, params.loanOfficerId));
  }
  if (typeof params.processorId === "string") {
    conditions.push(eq(deals.assignedProcessorId, params.processorId));
  }
  if (typeof params.lenderId === "string") {
    conditions.push(eq(deals.lenderId, params.lenderId));
  }
  if (typeof params.category === "string") {
    conditions.push(eq(deals.loanCategory, params.category as (typeof deals.loanCategory.enumValues)[number]));
  }
  if (typeof params.q === "string" && params.q.trim()) {
    const needle = `%${params.q.trim()}%`;
    conditions.push(
      or(
        ilike(deals.borrowerName, needle),
        ilike(deals.propertyAddress, needle),
        ilike(sql`CAST(${deals.loanNumber} AS TEXT)`, needle)
      )!
    );
  }

  const [allDeals, allUsers, allLenders] = await Promise.all([
    db.query.deals.findMany({
      where: and(...conditions),
      with: { assignedLoanOfficer: true, assignedProcessor: true, lender: true, stageHistory: true },
      orderBy: (deals, { desc }) => desc(deals.updatedAt),
    }),
    db.query.users.findMany({ where: (users, { eq }) => eq(users.active, true) }),
    db.query.lenders.findMany({ orderBy: (lenders, { asc }) => asc(lenders.name) }),
  ]);

  const boardDeals: BoardDeal[] = allDeals.map((deal) => {
    const sortedHistory = [...deal.stageHistory].sort(
      (a, b) => a.changedAt.getTime() - b.changedAt.getTime()
    );
    const currentStageEnteredAt = sortedHistory.at(-1)?.changedAt ?? deal.createdAt;
    const processingEnteredAt = sortedHistory.find((h) => h.stage === "processing")?.changedAt ?? null;

    return {
      id: deal.id,
      loanNumber: deal.loanNumber,
      borrowerName: deal.borrowerName,
      propertyAddress: deal.propertyAddress,
      loanAmountRequested: deal.loanAmountRequested,
      approvedLoanAmount: deal.approvedLoanAmount,
      originationPointsOverride: deal.originationPointsOverride,
      loanCategory: deal.loanCategory,
      stage: deal.stage,
      createdAt: deal.createdAt.toISOString(),
      currentStageEnteredAt: currentStageEnteredAt.toISOString(),
      processingEnteredAt: processingEnteredAt ? processingEnteredAt.toISOString() : null,
      assignedLoanOfficerName: deal.assignedLoanOfficer?.name ?? null,
      assignedProcessorName: deal.assignedProcessor?.name ?? null,
      lenderName: deal.lender?.name ?? null,
      isArchived: Boolean(deal.archivedAt),
    };
  });

  const loanOfficers = allUsers
    .filter((u) => u.baseRole === "loan_officer")
    .map((u) => ({ value: u.id, label: u.name ?? u.email ?? "Unknown" }));
  const processors = allUsers
    .filter((u) => u.baseRole === "processor")
    .map((u) => ({ value: u.id, label: u.name ?? u.email ?? "Unknown" }));
  const lenderOptions = allLenders.map((l) => ({ value: l.id, label: l.name }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Pipeline</h1>
          <Link href="/pipeline/archived" className="text-sm text-muted-foreground underline hover:text-foreground">
            View Archived Deals
          </Link>
        </div>
        <BoardSearch />
      </div>
      <BoardFilters loanOfficers={loanOfficers} processors={processors} lenders={lenderOptions} />
      <KanbanBoard deals={boardDeals} />
    </div>
  );
}
