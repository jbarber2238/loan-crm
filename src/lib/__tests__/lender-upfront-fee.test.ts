import { describe, expect, it } from "vitest";
import { lenderChargesUpfrontFee, termSheetFieldsFor, extractTermSheetFields } from "@/lib/term-sheet-fields";
import { calculateEstimatedCashToClose } from "@/lib/term-sheet-calculations";

describe("lender up-front fee", () => {
  it("applies to YAE Solutions only", () => {
    expect(lenderChargesUpfrontFee("YAE Solutions LLC")).toBe(true);
    expect(lenderChargesUpfrontFee("yae solutions")).toBe(true);
    expect(lenderChargesUpfrontFee("Dynamo Capital")).toBe(false);
    expect(lenderChargesUpfrontFee(null)).toBe(false);
  });

  it("adds the field to the term sheet form for that lender and nobody else", () => {
    const keys = (name?: string) => termSheetFieldsFor("dscr_purchase", name).map((f) => f.key);
    expect(keys("YAE Solutions LLC")).toEqual(expect.arrayContaining(["lenderUpfrontFee", "lenderUpfrontFeeDescription", "monthlyServicingFee"]));
    expect(keys("Visio Financial")).not.toContain("lenderUpfrontFee");
    expect(keys()).not.toContain("lenderUpfrontFee");
  });

  it("saves the value only for that lender", () => {
    const fd = new FormData();
    fd.set("lenderUpfrontFee", "1500");
    expect(extractTermSheetFields(fd, "dscr_purchase", false, "YAE Solutions LLC").lenderUpfrontFee).toBe(1500);
    expect(extractTermSheetFields(fd, "dscr_purchase", false, "Other").lenderUpfrontFee).toBeUndefined();
  });

  it("counts the fee in the cash due", () => {
    const base = {
      loanCategory: "dscr_purchase",
      purchasePrice: 500000,
      closingDisbursement: 375000,
      originationFee: 7500,
      costToBorrowerFee: 0,
      underwritingDocFee: 1495,
    };
    const without = calculateEstimatedCashToClose(base);
    expect(calculateEstimatedCashToClose({ ...base, lenderUpfrontFee: 1500 })).toBe(without + 1500);
  });
});
