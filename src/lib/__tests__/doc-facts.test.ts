import { describe, expect, it } from "vitest";
import {
  checkPayoff,
  checkPurchaseContract,
  cleanFacts,
  docFactKindForNeed,
  namesMatch,
  normalizeDay,
  normalizeMoney,
  type DocFacts,
  type DealFileFacts,
} from "@/lib/doc-facts";

const deal: DealFileFacts = {
  purchasePrice: 412000,
  borrowerName: "Sam Rivera",
  borrowerEntityName: "Example Builders LLC",
  estimatedClosingDay: "2026-12-04",
  payoffExpirationDay: null,
};

const purchase = (over: Record<string, { value: string | null; page: number | null }> = {}): DocFacts => ({
  kind: "purchase_contract",
  scannedAt: "2026-11-16T12:00:00Z",
  fields: {
    purchasePrice: { value: "412000", page: 1 },
    closingDate: { value: "2026-12-04", page: 2 },
    buyerName: { value: "Example Builders, L.L.C.", page: 1 },
    ...over,
  },
});

describe("docFactKindForNeed", () => {
  it("recognizes purchase agreements, addenda and extensions, and payoffs", () => {
    expect(docFactKindForNeed("Purchase Agreement")).toBe("purchase_contract");
    expect(docFactKindForNeed("Purchase Agreement - Addendum 2")).toBe("purchase_contract");
    expect(docFactKindForNeed("Fully Executed Purchase Contract Addenda")).toBe("purchase_contract");
    expect(docFactKindForNeed("Purchase Contract Extension")).toBe("purchase_contract");
    expect(docFactKindForNeed("Mortgage Payoff - Current")).toBe("payoff_statement");
  });
  it("ignores everything else", () => {
    expect(docFactKindForNeed("Lender Purchase Application")).toBeNull();
    expect(docFactKindForNeed("CV3 - DSCR Purchase Application")).toBeNull();
    expect(docFactKindForNeed("Mortgage Statement")).toBeNull();
  });
});

describe("cleaning scan output", () => {
  it("keeps real days and amounts only", () => {
    expect(normalizeDay("2026-09-30")).toBe("2026-09-30");
    expect(normalizeDay("2026-02-31")).toBeNull();
    expect(normalizeDay("Sept 30")).toBeNull();
    expect(normalizeMoney("$1,250,000.50")).toBe("1250000.5");
    expect(normalizeMoney(0)).toBeNull();
    expect(normalizeMoney("n/a")).toBeNull();
  });
  it("drops a page when there's no value", () => {
    const f = cleanFacts("payoff_statement", { totalPayoff: { value: "n/a", page: 3 }, expirationDate: { value: "2026-12-01", page: 2 } });
    expect(f.totalPayoff).toEqual({ value: null, page: null });
    expect(f.expirationDate).toEqual({ value: "2026-12-01", page: 2 });
  });
  it("never leaves a field out", () => {
    expect(Object.keys(cleanFacts("purchase_contract", {}))).toEqual(["purchasePrice", "closingDate", "buyerName"]);
  });
});

describe("namesMatch", () => {
  it("ignores case, punctuation and LLC-style endings", () => {
    expect(namesMatch("ZENITH CAPITAL PARTNERS LLC", "Zenith Capital Partners, L.L.C.")).toBe(true);
    expect(namesMatch("The Smith Family Trust", "Smith Family Trust")).toBe(true);
  });
  it("tells different names apart", () => {
    expect(namesMatch("Example Builders LLC", "Sample Builders LLC")).toBe(false);
    expect(namesMatch("", "")).toBe(false);
  });
});

describe("checkPurchaseContract", () => {
  it("passes a contract that matches the file", () => {
    const c = checkPurchaseContract(purchase(), deal);
    expect(c.price.state).toBe("match");
    expect(c.buyer.state).toBe("match");
    expect(c.closing.state).toBe("same");
  });
  it("flags a different price, buyer and closing date", () => {
    const c = checkPurchaseContract(
      purchase({ purchasePrice: { value: "425000", page: 1 }, buyerName: { value: "Someone Else LLC", page: 1 }, closingDate: { value: "2026-11-30", page: 2 } }),
      deal,
    );
    expect(c.price).toMatchObject({ state: "mismatch", contract: 425000, file: 412000 });
    expect(c.buyer.state).toBe("mismatch");
    expect(c.closing).toMatchObject({ state: "differs", contract: "2026-11-30", file: "2026-12-04" });
  });
  it("accepts the individual borrower as the buyer too", () => {
    expect(checkPurchaseContract(purchase({ buyerName: { value: "Sam Rivera", page: 1 } }), deal).buyer.state).toBe("match");
  });
  it("handles nothing on file and nothing found", () => {
    const c = checkPurchaseContract(purchase({ closingDate: { value: null, page: null }, buyerName: { value: null, page: null } }), { ...deal, purchasePrice: null });
    expect(c.price.state).toBe("no_file_value");
    expect(c.buyer.state).toBe("not_found");
    expect(c.closing.state).toBe("not_found");
  });
});

describe("checkPayoff", () => {
  const facts = (exp: string | null): DocFacts => ({
    kind: "payoff_statement",
    scannedAt: "2026-11-16T12:00:00Z",
    fields: { totalPayoff: { value: "198450.12", page: 1 }, expirationDate: { value: exp, page: exp ? 1 : null } },
  });
  it("is ready until Key Dates holds that date", () => {
    expect(checkPayoff(facts("2026-12-10"), { payoffExpirationDay: null })).toMatchObject({ state: "ready", total: 198450.12 });
    expect(checkPayoff(facts("2026-12-10"), { payoffExpirationDay: "2026-12-10" }).state).toBe("added");
  });
  it("reports no date found", () => {
    expect(checkPayoff(facts(null), { payoffExpirationDay: null }).state).toBe("not_found");
  });
});
