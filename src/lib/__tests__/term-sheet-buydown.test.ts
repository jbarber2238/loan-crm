import { describe, expect, it } from "vitest";
import { mergeSplitBuydownOptions, type MergeableOption } from "../term-sheet-buydown";

const opt = (label: string, rate: number, fee: number | undefined, extra: Record<string, string | number> = {}): MergeableOption => ({
  label,
  fields: { loanAmount: 525000, termMonths: 360, ...extra, interestRate: rate, ...(fee ? { costToBorrowerFee: fee } : {}) },
  buydownOptions: [],
});

describe("mergeSplitBuydownOptions", () => {
  it("collapses options that differ only by rate and points into one grid", () => {
    const out = mergeSplitBuydownOptions([
      opt("30yr Fixed @ 7.975% (0 pts)", 7.975, undefined),
      opt("30yr Fixed @ 7.531% (2.00 pts)", 7.531, 10500),
      opt("30yr Fixed @ 7.197% (3.50 pts)", 7.197, 18375),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("30yr Fixed");
    expect(out[0].buydownOptions.map((r) => [r.points, r.interestRate])).toEqual([[0, 7.975], [2, 7.531], [3.5, 7.197]]);
  });

  it("keeps genuinely different programs apart", () => {
    const input = [opt("5yr PPP", 7.5, undefined, { prepay: "5yr" }), opt("3yr PPP", 7.7, undefined, { prepay: "3yr" })];
    expect(mergeSplitBuydownOptions(input)).toHaveLength(2);
  });

  it("does not merge when more points do not buy a lower rate", () => {
    const input = [opt("A", 7.5, undefined), opt("B", 7.9, 5000)];
    expect(mergeSplitBuydownOptions(input)).toHaveLength(2);
  });
});
