import { describe, expect, it } from "vitest";
import { ENTITY_DOC_KINDS, carryOverKey, compareBorrowers, entityDocKindOf, normalizeName } from "../entity-doc-carryover";

describe("normalizeName", () => {
  it("ignores case, punctuation and spacing", () => {
    expect(normalizeName("1776 Holding, LLC")).toBe(normalizeName("1776  holding llc"));
    expect(normalizeName(null)).toBe("");
  });
});

describe("entityDocKindOf", () => {
  it("recognizes the five entity documents by need name", () => {
    expect(entityDocKindOf("Entity Docs - Articles of Organization")).toBe("articles");
    expect(entityDocKindOf("Articles of Incorporation")).toBe("articles");
    expect(entityDocKindOf("Foreign Entity Documents")).toBe("foreign");
    expect(entityDocKindOf("Entity Docs - Certificate of Good Standing")).toBe("good_standing");
    expect(entityDocKindOf("Entity Docs - Operating Agreement")).toBe("operating_agreement");
    expect(entityDocKindOf("Entity Docs - EIN")).toBe("ein");
  });
  it("leaves everything else alone", () => {
    expect(entityDocKindOf("Bank Statements")).toBeNull();
    expect(entityDocKindOf("ACH Statements")).toBeNull();
    expect(entityDocKindOf("Dynamo Loan Application")).toBeNull();
    expect(entityDocKindOf("Purchase Agreement")).toBeNull();
    expect(entityDocKindOf("Appraisal Payment")).toBeNull();
    expect(entityDocKindOf("Mortgage Payoff")).toBeNull();
  });
});

describe("optional extras", () => {
  it("recognizes the few documents worth reusing, and flags them as optional and re-reviewed", () => {
    expect(entityDocKindOf("Investor Experience Tracker (Dynamo Capital)")).toBe("experience");
    expect(entityDocKindOf("Investor Track Record (LIC)")).toBe("experience");
    expect(entityDocKindOf("Construction / Rehab Budget (Dynamo Capital)")).toBe("budget");
    expect(entityDocKindOf("REO Schedule")).toBe("reo_schedule");
    expect(entityDocKindOf("Drivers License")).toBe("drivers_license");
    const optional = ENTITY_DOC_KINDS.filter((k) => k.group === "optional");
    expect(optional.length).toBe(4);
    expect(optional.every((k) => k.needsReview)).toBe(true);
    expect(ENTITY_DOC_KINDS.filter((k) => k.group === "entity").map((k) => k.kind).sort()).toEqual(
      ["articles", "ein", "foreign", "good_standing", "operating_agreement"]
    );
  });
  it("lender-specific sheets need the same lender", () => {
    const need = (k: string) => ENTITY_DOC_KINDS.find((x) => x.kind === k)!.requiresSameLender;
    expect(need("experience")).toBe(true);
    expect(need("budget")).toBe(true);
    expect(need("reo_schedule")).toBe(false);
    expect(need("drivers_license")).toBe(false);
  });
});

describe("compareBorrowers", () => {
  const a = { borrowerName: "Andrew Smith", borrowerEmail: "andrew@x.com", borrowerEntityName: "Wheat Holdings LLC" };
  it("same name, entity and email: a confident match", () => {
    expect(compareBorrowers(a, { ...a })).toEqual({ same: true, emailMatches: true });
  });
  it("same name and entity with a different email: a match we should confirm", () => {
    expect(compareBorrowers(a, { ...a, borrowerEmail: "other@y.com" })).toEqual({ same: true, emailMatches: false });
  });
  it("tolerates punctuation and case differences", () => {
    expect(compareBorrowers(a, { ...a, borrowerName: "ANDREW SMITH", borrowerEntityName: "Wheat Holdings, LLC" }).same).toBe(true);
  });
  it("a different entity or name is not a match", () => {
    expect(compareBorrowers(a, { ...a, borrowerEntityName: "Other LLC" }).same).toBe(false);
    expect(compareBorrowers(a, { ...a, borrowerName: "Bob Jones" }).same).toBe(false);
  });
  it("no entity name on file is never a match", () => {
    expect(compareBorrowers({ ...a, borrowerEntityName: null }, { ...a, borrowerEntityName: null }).same).toBe(false);
  });
});

describe("carryOverKey", () => {
  it("uses the document kind for known documents", () => {
    expect(carryOverKey("Entity Docs - EIN")).toBe("ein");
    expect(carryOverKey("REO Schedule")).toBe("reo_schedule");
  });
  it("uses the need's own name for everything else, ignoring case and punctuation", () => {
    expect(carryOverKey("Bank Statements")).toBe(carryOverKey("bank  statements"));
    expect(carryOverKey("Bank Statements")).toBe("need:bankstatements");
    expect(carryOverKey("Bank Statements")).not.toBe(carryOverKey("ACH Statements"));
  });
});
