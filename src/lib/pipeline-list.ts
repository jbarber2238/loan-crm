// The processor list on the Pipeline page: deals as single-line rows grouped by stage, sorted the way each person
// likes. Kept free of React and the database so the rules can be tested on their own.

export type PipelineView = "board" | "list";
export type PipelineScope = "all" | "mine";
export type PipelineSort = "last_touched" | "longest_in_stage" | "closing_date" | "borrower" | "property" | "loan_amount";

export const PIPELINE_SORTS: { value: PipelineSort; label: string }[] = [
  { value: "last_touched", label: "Last touched" },
  { value: "longest_in_stage", label: "Longest in stage" },
  { value: "closing_date", label: "Closing date" },
  { value: "borrower", label: "Borrower name" },
  { value: "property", label: "Property address" },
  { value: "loan_amount", label: "Loan amount" },
];

export const parsePipelineView = (v: unknown): PipelineView => (v === "list" ? "list" : "board");
export const parsePipelineScope = (v: unknown): PipelineScope => (v === "mine" ? "mine" : "all");
export const parsePipelineSort = (v: unknown): PipelineSort => PIPELINE_SORTS.find((s) => s.value === v)?.value ?? "last_touched";

export interface PipelineListDeal {
  id: string;
  loanNumber: number;
  borrowerName: string;
  propertyAddress: string;
  loanCategory: string;
  stage: string;
  loanAmount: number;
  /** ISO time, or null when no closing date is set. */
  estimatedClosingDate: string | null;
  currentStageEnteredAt: string;
  lastTouchedAt: string;
  assignedLoanOfficerName: string | null;
  assignedProcessorName: string | null;
  lenderName: string | null;
  /** Client needs waiting on the processor to review what the borrower sent. */
  needsToReview: number;
  openConditions: number;
  isArchived: boolean;
}

/** The newest of several times, ignoring the empty ones; null when there are none. */
export function latestOf(times: (Date | null | undefined)[]): Date | null {
  const valid = times.filter((t): t is Date => t instanceof Date && !Number.isNaN(t.getTime()));
  return valid.length ? new Date(Math.max(...valid.map((t) => t.getTime()))) : null;
}

const time = (iso: string) => new Date(iso).getTime();
const text = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });

/** A sorted copy. Ties keep their original order, and a missing closing date always sorts last. */
export function sortPipelineDeals<T extends PipelineListDeal>(deals: T[], sort: PipelineSort): T[] {
  const compare: Record<PipelineSort, (a: T, b: T) => number> = {
    last_touched: (a, b) => time(b.lastTouchedAt) - time(a.lastTouchedAt),
    longest_in_stage: (a, b) => time(a.currentStageEnteredAt) - time(b.currentStageEnteredAt),
    closing_date: (a, b) => {
      if (!a.estimatedClosingDate && !b.estimatedClosingDate) return 0;
      if (!a.estimatedClosingDate) return 1;
      if (!b.estimatedClosingDate) return -1;
      return time(a.estimatedClosingDate) - time(b.estimatedClosingDate);
    },
    borrower: (a, b) => text(a.borrowerName, b.borrowerName),
    property: (a, b) => text(a.propertyAddress, b.propertyAddress),
    loan_amount: (a, b) => b.loanAmount - a.loanAmount,
  };
  return [...deals].sort(compare[sort]);
}

/** Stages in the order given, empty ones left out, each holding its deals sorted. */
export function groupDealsByStage<T extends PipelineListDeal>(
  deals: T[],
  stages: readonly { value: string; label: string }[],
  sort: PipelineSort,
): { stage: string; label: string; deals: T[] }[] {
  return stages
    .map((s) => ({ stage: s.value, label: s.label, deals: sortPipelineDeals(deals.filter((d) => d.stage === s.value), sort) }))
    .filter((g) => g.deals.length > 0);
}
