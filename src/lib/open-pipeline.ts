import { PIPELINE_STAGES } from "@/lib/deal-pipeline";
import { leadValueFor } from "@/lib/term-sheet-calculations";

// Open = everything from New through Clear to Close. Closed is done; On Hold,
// Follow-up, Lost and Disqualified aren't actively moving toward a close.
const OPEN_STAGES: Set<string> = new Set(PIPELINE_STAGES.filter((s) => s.value !== "closed").map((s) => s.value));

export interface OpenPipelineDeal {
  stage: string;
  isArchived?: boolean;
  loanAmountRequested: string;
  approvedLoanAmount: string | null;
  originationPointsOverride: string | null;
}

export interface OpenPipelineSummary {
  // What the open deals are worth to us: the same "lead value" each column on
  // the board totals, so the banner always equals the sum of those columns.
  value: number;
  // The loan dollars behind them (approved amount once there is one, otherwise
  // what the borrower requested).
  loanVolume: number;
  dealCount: number;
}

export function summarizeOpenPipeline(deals: OpenPipelineDeal[]): OpenPipelineSummary {
  let value = 0;
  let loanVolume = 0;
  let dealCount = 0;
  for (const deal of deals) {
    if (deal.isArchived || !OPEN_STAGES.has(deal.stage)) continue;
    const lead = leadValueFor({
      loanAmountRequested: Number(deal.loanAmountRequested) || 0,
      approvedLoanAmount: deal.approvedLoanAmount === null ? null : Number(deal.approvedLoanAmount),
      originationPointsOverride: deal.originationPointsOverride === null ? null : Number(deal.originationPointsOverride),
    });
    value += lead.amount;
    loanVolume += lead.basisAmount;
    dealCount++;
  }
  return { value, loanVolume, dealCount };
}
