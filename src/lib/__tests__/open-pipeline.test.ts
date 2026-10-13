import { describe, expect, it } from "vitest";
import { summarizeOpenPipeline } from "@/lib/open-pipeline";

const deal = (stage: string, requested: string, approved: string | null = null, extra = {}) => ({
  stage,
  loanAmountRequested: requested,
  approvedLoanAmount: approved,
  originationPointsOverride: null,
  ...extra,
});

describe("summarizeOpenPipeline", () => {
  it("counts New through Clear to Close and nothing else", () => {
    const summary = summarizeOpenPipeline([
      deal("new", "100000"),
      deal("underwriting_review", "200000"),
      deal("clear_to_close", "300000"),
      deal("closed", "400000"),
      deal("on_hold", "500000"),
      deal("follow_up", "600000"),
      deal("lost", "700000"),
      deal("disqualified", "800000"),
    ]);
    expect(summary.dealCount).toBe(3);
    expect(summary.loanVolume).toBe(600000);
  });

  it("values a deal at 2% of the request until a loan is approved, then at its origination fee", () => {
    const estimated = summarizeOpenPipeline([deal("new", "100000")]);
    expect(estimated.value).toBe(2000);
    const approved = summarizeOpenPipeline([deal("application", "100000", "150000")]);
    expect(approved.value).toBe(3000);
    expect(approved.loanVolume).toBe(150000);
  });

  it("ignores archived deals", () => {
    expect(summarizeOpenPipeline([deal("new", "100000", null, { isArchived: true })]).dealCount).toBe(0);
  });
});
