import { describe, expect, it } from "vitest";
import { estimatedFeeFrom, STANDARD_APPRAISAL_ESTIMATE, STANDARD_CREDIT_PULL_ESTIMATE } from "@/lib/term-sheet-calculations";
import { termSheetFieldsFor } from "@/lib/term-sheet-fields";

describe("estimatedFeeFrom", () => {
  it("uses the entered figure, such as a $2,900 mixed-use appraisal", () => {
    expect(estimatedFeeFrom(2900, STANDARD_APPRAISAL_ESTIMATE)).toBe(2900);
  });

  it("falls back to the standard figure when nothing is stored", () => {
    expect(estimatedFeeFrom(undefined, STANDARD_APPRAISAL_ESTIMATE)).toBe(1000);
    expect(estimatedFeeFrom(null, STANDARD_CREDIT_PULL_ESTIMATE)).toBe(130);
    expect(estimatedFeeFrom("", STANDARD_CREDIT_PULL_ESTIMATE)).toBe(130);
  });

  it("keeps a deliberate zero and rejects junk or negatives", () => {
    expect(estimatedFeeFrom(0, STANDARD_APPRAISAL_ESTIMATE)).toBe(0);
    expect(estimatedFeeFrom("abc", STANDARD_APPRAISAL_ESTIMATE)).toBe(1000);
    expect(estimatedFeeFrom(-5, STANDARD_APPRAISAL_ESTIMATE)).toBe(1000);
  });
});

describe("term sheet form fee fields", () => {
  it("pre-fills $130 and $1,000 on every loan category", () => {
    for (const category of ["dscr_purchase", "fix_and_flip", "bridge_purchase", "portfolio"]) {
      const fields = termSheetFieldsFor(category);
      expect(fields.find((f) => f.key === "creditPullFee")?.defaultValue).toBe("130");
      expect(fields.find((f) => f.key === "appraisalFee")?.defaultValue).toBe("1000");
    }
  });
});
