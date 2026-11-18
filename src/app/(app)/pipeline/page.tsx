import { and, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals, users } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import Link from "next/link";
import { licenseFlagsFor } from "@/server/licensing";
import { KanbanBoard, type BoardDeal } from "@/components/board/kanban-board";
import { BoardFilters } from "@/components/board/board-filters";
import { BoardSearch } from "@/components/board/board-search";
import { PipelineTabs } from "@/components/board/pipeline-tabs";
import { PipelineViewControls } from "@/components/board/pipeline-view-controls";
import { ProcessorList } from "@/components/board/processor-list";
import { loadDealActivity } from "@/server/pipeline-activity";
import { latestOf, parsePipelineScope, parsePipelineSort, parsePipelineView, type PipelineListDeal } from "@/lib/pipeline-list";

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  // How this person likes the page (saved whenever they change it): board or list, all deals or only theirs, list sort.
  const prefsRow = await db.query.users.findFirst({
    where: eq(users.id, user.id),
    columns: { pipelineView: true, pipelineScope: true, pipelineSort: true },
  });
  const view = parsePipelineView(prefsRow?.pipelineView);
  const scope = parsePipelineScope(prefsRow?.pipelineScope);
  const sort = parsePipelineSort(prefsRow?.pipelineSort);

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
  if (scope === "mine") {
    conditions.push(
      or(eq(deals.assignedLoanOfficerId, user.id), eq(deals.assignedProcessorId, user.id), eq(deals.assignedAssistantId, user.id))!
    );
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

  const licenseFlags = await licenseFlagsFor(allDeals.map((d) => d.propertyAddress));
  const boardDeals: BoardDeal[] = allDeals.map((deal, index) => {
    const sortedHistory = [...deal.stageHistory].sort(
      (a, b) => a.changedAt.getTime() - b.changedAt.getTime()
    );
    const currentStageEnteredAt = sortedHistory.at(-1)?.changedAt ?? deal.createdAt;
    const processingEnteredAt = sortedHistory.find((h) => h.stage === "initial_app_review")?.changedAt ?? null;

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
      licenseState: licenseFlags[index]?.stateCode ?? null,
    };
  });

  // The processor list also shows when each deal was last touched and what is waiting on the processor.
  let listDeals: PipelineListDeal[] = [];
  if (view === "list") {
    const activity = await loadDealActivity(allDeals.map((d) => d.id));
    listDeals = allDeals.map((deal, index) => {
      const board = boardDeals[index];
      const a = activity.get(deal.id);
      return {
        id: deal.id,
        loanNumber: deal.loanNumber,
        borrowerName: deal.borrowerName,
        propertyAddress: deal.propertyAddress,
        loanCategory: deal.loanCategory,
        stage: deal.stage,
        loanAmount: Number(deal.approvedLoanAmount ?? deal.loanAmountRequested),
        estimatedClosingDate: deal.estimatedClosingDate ? deal.estimatedClosingDate.toISOString() : null,
        currentStageEnteredAt: board.currentStageEnteredAt,
        lastTouchedAt: (latestOf([deal.updatedAt, new Date(board.currentStageEnteredAt), a?.lastActivityAt]) ?? deal.createdAt).toISOString(),
        assignedLoanOfficerName: board.assignedLoanOfficerName,
        assignedProcessorName: board.assignedProcessorName,
        lenderName: board.lenderName,
        needsToReview: a?.needsToReview ?? 0,
        openConditions: a?.openConditions ?? 0,
        isArchived: board.isArchived,
      };
    });
  }

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
        <div className="flex flex-wrap items-center gap-3">
          <BoardSearch />
          <Link
            href="/deals/new"
            className="theme-dark-only !inline-flex min-h-11 items-center rounded-full bg-[#fa5f05] px-[22px] text-sm font-bold text-[#0b0c0d] hover:bg-[#fdb78f]"
          >
            + New Deal
          </Link>
        </div>
      </div>
      <div data-board-toolbar className="space-y-4">
        <PipelineTabs showLeads={user.isAdmin || user.baseRole === "loan_officer"} />
        <PipelineViewControls view={view} scope={scope} sort={sort} />
        <BoardFilters loanOfficers={loanOfficers} processors={processors} lenders={lenderOptions} />
      </div>
      {view === "list" ? <ProcessorList deals={listDeals} sort={sort} /> : <KanbanBoard deals={boardDeals} />}
    </div>
  );
}
