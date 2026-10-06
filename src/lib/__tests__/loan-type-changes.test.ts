import { describe, it, expect } from "vitest";
import { allowedTermSheetCategories, canChangeLoanType } from "@/lib/loan-type-changes";

describe("loan type changes", () => {
  it("DSCR purchase can become fix and flip or bridge purchase, and nothing else", () => {
    expect(allowedTermSheetCategories("dscr_purchase")).toEqual(["dscr_purchase", "fix_and_flip", "bridge_purchase"]);
    expect(canChangeLoanType("dscr_purchase", "dscr_rate_term_refinance")).toBe(false);
  });
  it("DSCR cash-out can become rate & term, bridge refinance or fix and flip", () => {
    for (const to of ["dscr_rate_term_refinance", "bridge_refinance", "fix_and_flip"]) {
      expect(canChangeLoanType("dscr_cash_out_refinance", to)).toBe(true);
    }
    expect(canChangeLoanType("dscr_cash_out_refinance", "dscr_purchase")).toBe(false);
  });
  it("DSCR rate & term can become cash-out, fix and flip or bridge refinance", () => {
    for (const to of ["dscr_cash_out_refinance", "fix_and_flip", "bridge_refinance"]) {
      expect(canChangeLoanType("dscr_rate_term_refinance", to)).toBe(true);
    }
    expect(canChangeLoanType("dscr_rate_term_refinance", "bridge_purchase")).toBe(false);
  });
  it("other loan types can only be quoted as themselves", () => {
    expect(allowedTermSheetCategories("fix_and_flip")).toEqual(["fix_and_flip"]);
    expect(canChangeLoanType("fix_and_flip", "bridge_purchase")).toBe(false);
  });
  it("the same type is never a change", () => {
    expect(canChangeLoanType("dscr_cash_out_refinance", "dscr_cash_out_refinance")).toBe(false);
  });
});
