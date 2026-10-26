import { describe, expect, it } from "vitest";
import { compareBorrowers, entityDocKindOf, normalizeName } from "../entity-doc-carryover";

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
    expect(entityDocKindOf("Drivers License")).toBeNull();
    expect(entityDocKindOf("Dynamo Loan Application")).toBeNull();
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
