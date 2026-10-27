import { describe, expect, it } from "vitest";
import { activeRulesFor } from "../../server/client-need-rules";

const base = { currentOccupancy: null as string | null };

describe("refi_with_payoff rule on owned Fix & Flip / New Construction", () => {
  it("applies when they own it and still owe on it", () => {
    for (const loanCategory of ["fix_and_flip", "new_construction"]) {
      expect(activeRulesFor({ ...base, loanCategory, mortgagePayoffAmount: "120000", propertyAlreadyOwned: true })).toContain("refi_with_payoff");
    }
  });

  it("does not apply when owned free and clear ($0) or when the debt was never answered", () => {
    expect(activeRulesFor({ ...base, loanCategory: "fix_and_flip", mortgagePayoffAmount: "0", propertyAlreadyOwned: true })).not.toContain("refi_with_payoff");
    expect(activeRulesFor({ ...base, loanCategory: "fix_and_flip", mortgagePayoffAmount: null, propertyAlreadyOwned: true })).not.toContain("refi_with_payoff");
  });

  it("does not apply on a plain purchase, even if a payoff amount is on file", () => {
    expect(activeRulesFor({ ...base, loanCategory: "new_construction", mortgagePayoffAmount: "50000", propertyAlreadyOwned: false })).not.toContain("refi_with_payoff");
  });

  it("still applies to refinances as before", () => {
    expect(activeRulesFor({ ...base, loanCategory: "bridge_refinance", mortgagePayoffAmount: "300000" })).toContain("refi_with_payoff");
  });
});
