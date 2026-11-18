import { describe, expect, it } from "vitest";
import { groupDealsByStage, latestOf, parsePipelineScope, parsePipelineSort, parsePipelineView, sortPipelineDeals, type PipelineListDeal } from "../pipeline-list";

const deal = (id: string, patch: Partial<PipelineListDeal> = {}): PipelineListDeal => ({
  id,
  loanNumber: 1,
  borrowerName: id,
  propertyAddress: id,
  loanCategory: "dscr",
  stage: "new",
  loanAmount: 0,
  estimatedClosingDate: null,
  currentStageEnteredAt: "2026-11-01T00:00:00Z",
  lastTouchedAt: "2026-11-01T00:00:00Z",
  assignedLoanOfficerName: null,
  assignedProcessorName: null,
  lenderName: null,
  needsToReview: 0,
  openConditions: 0,
  isArchived: false,
  ...patch,
});
const ids = (ds: PipelineListDeal[]) => ds.map((d) => d.id);

describe("saved preferences", () => {
  it("fall back to the board, all deals and last touched for anything unknown", () => {
    expect(parsePipelineView("list")).toBe("list");
    expect(parsePipelineView("nope")).toBe("board");
    expect(parsePipelineScope("mine")).toBe("mine");
    expect(parsePipelineScope(undefined)).toBe("all");
    expect(parsePipelineSort("borrower")).toBe("borrower");
    expect(parsePipelineSort("priority")).toBe("last_touched");
  });
});

describe("latestOf", () => {
  it("takes the newest time and ignores empty ones", () => {
    expect(latestOf([new Date("2026-11-01"), null, new Date("2026-11-09"), undefined])).toEqual(new Date("2026-11-09"));
    expect(latestOf([null, undefined])).toBeNull();
  });
});

describe("sortPipelineDeals", () => {
  it("puts the most recently touched first", () => {
    const sorted = sortPipelineDeals([deal("a", { lastTouchedAt: "2026-11-01T00:00:00Z" }), deal("b", { lastTouchedAt: "2026-11-09T00:00:00Z" })], "last_touched");
    expect(ids(sorted)).toEqual(["b", "a"]);
  });
  it("puts whoever has been in their stage longest first", () => {
    const sorted = sortPipelineDeals([deal("a", { currentStageEnteredAt: "2026-11-09T00:00:00Z" }), deal("b", { currentStageEnteredAt: "2026-11-01T00:00:00Z" })], "longest_in_stage");
    expect(ids(sorted)).toEqual(["b", "a"]);
  });
  it("sorts closing dates soonest first with deals that have none last", () => {
    const sorted = sortPipelineDeals([deal("none"), deal("late", { estimatedClosingDate: "2026-12-20T00:00:00Z" }), deal("soon", { estimatedClosingDate: "2026-11-20T00:00:00Z" })], "closing_date");
    expect(ids(sorted)).toEqual(["soon", "late", "none"]);
  });
  it("sorts names and addresses alphabetically, ignoring case and reading numbers as numbers", () => {
    expect(ids(sortPipelineDeals([deal("b", { borrowerName: "bravo" }), deal("a", { borrowerName: "Alpha" })], "borrower"))).toEqual(["a", "b"]);
    expect(ids(sortPipelineDeals([deal("x", { propertyAddress: "100 Oak St" }), deal("y", { propertyAddress: "9 Oak St" })], "property"))).toEqual(["y", "x"]);
  });
  it("sorts loan amount largest first and does not change the list it was given", () => {
    const input = [deal("small", { loanAmount: 100 }), deal("big", { loanAmount: 900 })];
    expect(ids(sortPipelineDeals(input, "loan_amount"))).toEqual(["big", "small"]);
    expect(ids(input)).toEqual(["small", "big"]);
  });
  it("keeps the original order for ties", () => {
    expect(ids(sortPipelineDeals([deal("x"), deal("y"), deal("z")], "last_touched"))).toEqual(["x", "y", "z"]);
  });
});

describe("groupDealsByStage", () => {
  const stages = [
    { value: "new", label: "New" },
    { value: "underwriting_review", label: "Underwriting Review" },
    { value: "closed", label: "Closed" },
  ];
  it("keeps the stage order, drops empty stages and sorts inside each", () => {
    const groups = groupDealsByStage(
      [deal("a", { stage: "underwriting_review", borrowerName: "Zed" }), deal("b", { stage: "new" }), deal("c", { stage: "underwriting_review", borrowerName: "Amy" })],
      stages,
      "borrower",
    );
    expect(groups.map((g) => g.stage)).toEqual(["new", "underwriting_review"]);
    expect(ids(groups[1].deals)).toEqual(["c", "a"]);
  });
});
