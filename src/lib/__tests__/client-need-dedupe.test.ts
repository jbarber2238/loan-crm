import { describe, expect, it } from "vitest";
import { needsNotAlreadyOnDeal } from "../client-need-dedupe";

describe("needsNotAlreadyOnDeal", () => {
  it("skips a need the deal already has by name, whatever the capitals", () => {
    const out = needsNotAlreadyOnDeal([{ itemName: "Drivers License" }], [{ itemName: "drivers license" }, { itemName: "Entity Docs" }]);
    expect(out.map((n) => n.itemName)).toEqual(["Entity Docs"]);
  });

  it("adds another lender's form of the same name", () => {
    const out = needsNotAlreadyOnDeal(
      [{ itemName: "Lender Loan Application", lenderTagId: "visio" }],
      [{ itemName: "Lender Loan Application", lenderTagId: "dynamo" }]
    );
    expect(out).toHaveLength(1);
  });

  it("does not double up the same lender's form", () => {
    const out = needsNotAlreadyOnDeal(
      [{ itemName: "Lender Loan Application", lenderTagId: "dynamo" }],
      [{ itemName: "Lender Loan Application", lenderTagId: "dynamo" }]
    );
    expect(out).toHaveLength(0);
  });

  it("treats an untagged copy as the same need", () => {
    expect(needsNotAlreadyOnDeal([{ itemName: "Servicing Guide", lenderTagId: null }], [{ itemName: "Servicing Guide", lenderTagId: "dynamo" }])).toHaveLength(0);
    expect(needsNotAlreadyOnDeal([{ itemName: "Servicing Guide", lenderTagId: "dynamo" }], [{ itemName: "Servicing Guide" }])).toHaveLength(0);
  });
});
