import { conservativeValueBasis, calculateLtv } from "@/lib/term-sheet-calculations";
import { isInterestOnlyCategory } from "@/lib/loan-sections";
import type { deals, termSheets } from "@/server/db/schema";

type Deal = typeof deals.$inferSelect;
type TermSheet = typeof termSheets.$inferSelect;

const DSCR_CATEGORIES = new Set(["dscr_purchase", "dscr_cash_out_refinance", "dscr_rate_term_refinance"]);

/** Which of the two loan-type-specific "term sheet ready" templates applies to this deal. */
export function resolveTermSheetReadyTemplateKey(loanCategory: string): string {
  return DSCR_CATEGORIES.has(loanCategory) || loanCategory === "portfolio"
    ? "borrower_term_sheet_ready_dscr"
    : "borrower_term_sheet_ready_hml";
}

function numField(fields: Record<string, unknown>, key: string): number | null {
  const value = fields[key];
  const n = Number(value);
  return typeof value !== "undefined" && value !== null && value !== "" && Number.isFinite(n) ? n : null;
}

function textField(fields: Record<string, unknown>, key: string): string | null {
  const value = fields[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function formatRange(values: number[], format: (n: number) => string): string {
  const nums = values.filter((n): n is number => n !== null && Number.isFinite(n));
  if (!nums.length) return "Not provided";
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return min === max ? format(min) : `${format(min)}–${format(max)}`;
}

function formatPercent(n: number): string {
  return `${Number(n.toFixed(1))}%`;
}

function formatMoney(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function formatYears(n: number): string {
  return `${Number(n.toFixed(1))}-year`;
}

function formatMonths(n: number): string {
  return `${Number(n.toFixed(0))}-month`;
}

function distinctJoin(values: (string | null)[]): string {
  const clean = Array.from(new Set(values.filter((v): v is string => Boolean(v))));
  return clean.length ? clean.join(", ") : "Not provided";
}

/**
 * Every term sheet the borrower is about to receive gets folded into one
 * range/list per figure — Justin wants "lowest to highest" across whatever's
 * actually being sent, not a single hardcoded number, since he's often
 * sending 2-3 competing offers at once.
 */
export function summarizeTermSheetsForBorrowerEmail(
  deal: Deal,
  sheets: TermSheet[]
): Record<string, string> {
  const valueBasis = conservativeValueBasis(
    deal.purchasePrice ? Number(deal.purchasePrice) : null,
    deal.estimatedAsIsValue ? Number(deal.estimatedAsIsValue) : null
  );

  const loanAmounts: number[] = [];
  const ltvs: number[] = [];
  const terms: number[] = [];
  const amortizationTypes: (string | null)[] = [];
  const prepaymentPenalties: (string | null)[] = [];

  for (const sheet of sheets) {
    const fields = sheet.fields;
    const loanAmount = numField(fields, "loanAmount");
    if (loanAmount !== null) {
      loanAmounts.push(loanAmount);
      const ltv = calculateLtv(loanAmount, valueBasis);
      if (ltv !== null) ltvs.push(ltv);
    }
    const term = numField(fields, isInterestOnlyCategory(deal.loanCategory) ? "loanTermMonths" : "loanTermYears");
    if (term !== null) terms.push(term);
    amortizationTypes.push(textField(fields, "amortizationType"));
    prepaymentPenalties.push(textField(fields, "prepaymentPenalty"));
  }

  return {
    loanAmountRange: formatRange(loanAmounts, formatMoney),
    ltvRange: formatRange(ltvs, formatPercent),
    loanTermRange: formatRange(terms, isInterestOnlyCategory(deal.loanCategory) ? formatMonths : formatYears),
    loanTypeOptions: distinctJoin(amortizationTypes),
    prepaymentPenaltyOptions: distinctJoin(prepaymentPenalties),
  };
}
