// Facts an AI scan reads off two kinds of uploaded documents, and how they're checked against the deal.
// Pure rules (no database, no AI call) so they're easy to test. Nothing here changes a deal: a person looks at the
// scan and clicks a button, and only then does a value get copied across.

import { isDateString } from "@/lib/tasks";

export type DocFactKind = "purchase_contract" | "payoff_statement";

export interface FactCell {
  value: string | null;
  page: number | null;
}

export interface DocFacts {
  kind: DocFactKind;
  scannedAt: string;
  fields: Record<string, FactCell>;
}

export const PURCHASE_FIELDS = ["purchasePrice", "closingDate", "buyerName"] as const;
export const PAYOFF_FIELDS = ["totalPayoff", "expirationDate"] as const;

export const FACT_FIELD_LABELS: Record<string, string> = {
  purchasePrice: "Purchase Price",
  closingDate: "Closing Date",
  buyerName: "Buyer / Entity Closing",
  totalPayoff: "Total Payoff",
  expirationDate: "Payoff Expiration Date",
};

/**
 * Which scan (if any) a client need gets, going by its name. Matched loosely because the same item is worded a few
 * ways ("Purchase Agreement", "Purchase Agreement - Addendum 2", "Purchase Contract Extension", "Mortgage Payoff -
 * Current"). Amendments and extensions count: they're where the newest closing date usually is. Applications and
 * mortgage statements don't.
 */
export function docFactKindForNeed(itemName: string): DocFactKind | null {
  const name = itemName.toLowerCase();
  if (/purchase\s+(agreement|contract)/.test(name)) return "purchase_contract";
  if (/payoff/.test(name)) return "payoff_statement";
  return null;
}

export function fieldsFor(kind: DocFactKind): readonly string[] {
  return kind === "purchase_contract" ? PURCHASE_FIELDS : PAYOFF_FIELDS;
}

/** "$1,250,000.50", "1250000", 1250000 -> "1250000.5". Null when it isn't a positive amount. */
export function normalizeMoney(raw: unknown): string | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.replace(/[^0-9.]/g, "")) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return String(Math.round(n * 100) / 100);
}

/** Only a real calendar day in YYYY-MM-DD is kept. The scan is told to answer that way. */
export function normalizeDay(raw: unknown): string | null {
  return typeof raw === "string" && isDateString(raw.trim()) ? raw.trim() : null;
}

function cell(raw: unknown, clean: (v: unknown) => string | null): FactCell {
  if (typeof raw !== "object" || raw === null) return { value: null, page: null };
  const f = raw as { value?: unknown; page?: unknown };
  const value = clean(f.value);
  const page = typeof f.page === "number" && Number.isInteger(f.page) && f.page >= 1 ? f.page : null;
  return { value, page: value ? page : null };
}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Cleans what the model returned into the stored shape: dates as YYYY-MM-DD, amounts as plain numbers, no guesses kept. */
export function cleanFacts(kind: DocFactKind, raw: Record<string, unknown>): Record<string, FactCell> {
  const cleaners: Record<string, (v: unknown) => string | null> = {
    purchasePrice: normalizeMoney,
    closingDate: normalizeDay,
    buyerName: text,
    totalPayoff: normalizeMoney,
    expirationDate: normalizeDay,
  };
  return Object.fromEntries(fieldsFor(kind).map((key) => [key, cell(raw[key], cleaners[key])]));
}

// ---- Comparing with what's on file ----------------------------------------------------------------------

const ENTITY_SUFFIX = /\b(l\.?l\.?c\.?|inc\.?|incorporated|corp\.?|corporation|co\.?|ltd\.?|lp|l\.?p\.?|llp|company|pllc)\b/g;

/** Lower-case, no punctuation, no "LLC"/"Inc" and the like, so "Zenith Capital Partners, LLC" equals "ZENITH CAPITAL PARTNERS L.L.C." */
export function normalizeEntityName(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(ENTITY_SUFFIX, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\bthe\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function namesMatch(a: string, b: string): boolean {
  const x = normalizeEntityName(a);
  const y = normalizeEntityName(b);
  return x !== "" && x === y;
}

export interface DealFileFacts {
  purchasePrice: number | null;
  borrowerName: string;
  borrowerEntityName: string | null;
  /** YYYY-MM-DD, or null when there isn't one yet. */
  estimatedClosingDay: string | null;
  /** YYYY-MM-DD, or null. */
  payoffExpirationDay: string | null;
}

export type CheckState = "match" | "mismatch" | "not_found" | "no_file_value";

export interface PurchaseCheck {
  price: { state: CheckState; contract: number | null; file: number | null };
  buyer: { state: CheckState; contract: string | null; file: string | null };
  closing: { state: "same" | "differs" | "not_found"; contract: string | null; file: string | null };
}

/** Purchase agreement versus the loan inquiry on the Overview tab: price, who's buying, and the closing date. */
export function checkPurchaseContract(facts: DocFacts, deal: DealFileFacts): PurchaseCheck {
  const f = facts.fields;
  const price = f.purchasePrice?.value ? Number(f.purchasePrice.value) : null;
  const buyer = f.buyerName?.value ?? null;
  const closing = f.closingDate?.value ?? null;

  const priceState: CheckState =
    price === null ? "not_found" : deal.purchasePrice === null ? "no_file_value" : Math.abs(price - deal.purchasePrice) < 0.5 ? "match" : "mismatch";

  const fileBuyer = deal.borrowerEntityName?.trim() || deal.borrowerName;
  const buyerState: CheckState =
    buyer === null
      ? "not_found"
      : namesMatch(buyer, fileBuyer) || namesMatch(buyer, deal.borrowerName) || (deal.borrowerEntityName ? namesMatch(buyer, deal.borrowerEntityName) : false)
        ? "match"
        : "mismatch";

  return {
    price: { state: priceState, contract: price, file: deal.purchasePrice },
    buyer: { state: buyerState, contract: buyer, file: fileBuyer },
    closing: { state: closing === null ? "not_found" : closing === deal.estimatedClosingDay ? "same" : "differs", contract: closing, file: deal.estimatedClosingDay },
  };
}

export interface PayoffCheck {
  total: number | null;
  expiration: string | null;
  /** "added" once Key Dates already holds this exact date. */
  state: "not_found" | "ready" | "added";
}

export function checkPayoff(facts: DocFacts, deal: Pick<DealFileFacts, "payoffExpirationDay">): PayoffCheck {
  const total = facts.fields.totalPayoff?.value ? Number(facts.fields.totalPayoff.value) : null;
  const expiration = facts.fields.expirationDate?.value ?? null;
  return { total, expiration, state: expiration === null ? "not_found" : expiration === deal.payoffExpirationDay ? "added" : "ready" };
}

export function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

/** "2026-09-30" -> "9/30/2026" */
export function formatDayShort(day: string): string {
  const [y, m, d] = day.split("-");
  return `${Number(m)}/${Number(d)}/${y}`;
}
