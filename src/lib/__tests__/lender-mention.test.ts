import { describe, expect, it } from "vitest";
import { findLenderMention, lenderAliases, mentionsLender, replaceLenderInText, stripLenderFromTitle } from "../lender-mention";

const LENDERS = [
  { id: "1", name: "Dynamo Capital" },
  { id: "2", name: "CV3" },
  { id: "3", name: "Lend Investor Capital" },
  { id: "4", name: "Capital Fund 1" },
  { id: "5", name: "Visio Lending" },
  { id: "6", name: "RCN Capital" },
  { id: "7", name: "Rain City Capital" },
  { id: "8", name: "YAE Solutions LLC" },
];

describe("lenderAliases", () => {
  it("adds the short form and, for long names, the initials", () => {
    expect(lenderAliases("Dynamo Capital").map((a) => a.text)).toEqual(["Dynamo Capital", "Dynamo"]);
    expect(lenderAliases("Lend Investor Capital").map((a) => a.text)).toEqual(["Lend Investor Capital", "Lend Investor", "LIC"]);
    expect(lenderAliases("YAE Solutions LLC").map((a) => a.text)).toEqual(["YAE Solutions LLC", "YAE", "YSL"]);
  });

  it("keeps a name whole when it has no company-type ending", () => {
    expect(lenderAliases("CV3").map((a) => a.text)).toEqual(["CV3"]);
    expect(lenderAliases("Capital Fund 1").map((a) => a.text)).toEqual(["Capital Fund 1"]);
  });
});

describe("findLenderMention", () => {
  it("finds a full name, a short form, a plural and initials", () => {
    expect(findLenderMention("ACH form for Dynamo Capital", LENDERS)?.id).toBe("1");
    expect(findLenderMention("the dynamo loan application", LENDERS)?.id).toBe("1");
    expect(findLenderMention("CV3's app authorization", LENDERS)?.id).toBe("2");
    expect(findLenderMention("track record for Lend Investors Capital", LENDERS)?.id).toBe("3");
    expect(findLenderMention("LIC track record", LENDERS)?.id).toBe("3");
    expect(findLenderMention("Rain City draw request form", LENDERS)?.id).toBe("7");
  });

  it("does not mistake ordinary words for a lender", () => {
    expect(findLenderMention("proof of insurance for the subject property", LENDERS)).toBeNull();
    expect(findLenderMention("copy of the GC license", LENDERS)).toBeNull();
    expect(findLenderMention("capital improvements budget", LENDERS)).toBeNull();
    expect(findLenderMention("flood policy and agent contact", LENDERS)).toBeNull();
  });

  it("prefers the longest match when two lenders could fit", () => {
    expect(findLenderMention("RCN Capital rehab budget", LENDERS)?.id).toBe("6");
  });
});

describe("mentionsLender", () => {
  it("checks one lender", () => {
    expect(mentionsLender("Dynamo Loan Application", "Dynamo Capital")).toBe(true);
    expect(mentionsLender("Loan Application", "Dynamo Capital")).toBe(false);
  });
});

describe("stripLenderFromTitle", () => {
  it("takes the lender out and tidies what is left", () => {
    expect(stripLenderFromTitle("ACH Authorization Agreement - (Dynamo Capital)", "Dynamo Capital")).toBe("ACH Authorization Agreement");
    expect(stripLenderFromTitle("Dynamo Capital Servicing Guide", "Dynamo Capital")).toBe("Servicing Guide");
    expect(stripLenderFromTitle("CV3 - Purchase Application", "CV3")).toBe("Purchase Application");
    expect(stripLenderFromTitle("Investor Track Record (LIC)", "Lend Investor Capital")).toBe("Investor Track Record");
    expect(stripLenderFromTitle("Dynamo Loan Application", "Dynamo Capital")).toBe("Loan Application");
  });

  it("leaves a clean title alone", () => {
    expect(stripLenderFromTitle("Proof of Insurance", "Dynamo Capital")).toBe("Proof of Insurance");
  });
});

describe("replaceLenderInText", () => {
  it("says 'the lender' instead", () => {
    expect(replaceLenderInText("so Dynamo Capital can set up automatic payments.", "Dynamo Capital")).toBe(
      "so the lender can set up automatic payments."
    );
    expect(replaceLenderInText("Please open the Dynamo Capital loan application.", "Dynamo Capital")).toBe(
      "Please open the lender loan application."
    );
    expect(replaceLenderInText("Use CV3's portal. CV3 will email you.", "CV3")).toBe("Use the lender's portal. The lender will email you.");
  });
});
