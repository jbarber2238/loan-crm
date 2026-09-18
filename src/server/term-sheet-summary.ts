import { conservativeValueBasis, calculateLtv } from "@/lib/term-sheet-calculations";
import { isInterestOnlyCategory } from "@/lib/loan-sections";
import { htmlFactList } from "@/lib/email-html";
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
    deal.loanCategory,
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

// Two decimals (not formatPercent's one) so a real-world rate like 6.99%
// doesn't round away the number a borrower actually cares about.
function formatRatePercent(n: number): string {
  return `${Number(n.toFixed(2))}%`;
}

// amortizationType is freeform ("30 Year Fixed", "5/6 ARM, ..."), and it's
// the only place an ARM designation is captured at all — so when it
// mentions ARM, that text *is* the loan-type label. Otherwise, build a
// plain "{n}-year/month term" from the structured term field, matching how
// Justin wants a standard fixed loan described on a term-sheet button.
function loanTypeLabelForButton(deal: Deal, fields: Record<string, unknown>): string | null {
  const amortizationType = textField(fields, "amortizationType");
  if (amortizationType && /arm/i.test(amortizationType)) return amortizationType;

  const isMonths = isInterestOnlyCategory(deal.loanCategory);
  const term = numField(fields, isMonths ? "loanTermMonths" : "loanTermYears");
  if (term !== null) return `${Math.round(term)}-${isMonths ? "month" : "year"} term`;

  return amortizationType;
}

/**
 * The label for a single term sheet's own "view term sheet" email button —
 * this specific sheet's own rate/type/LTV (e.g. "6.99%, 30-year term, 80%
 * LTV"), not the lowest-to-highest range across every sheet being sent
 * (that's what summarizeTermSheetsForBorrowerEmail's ranges are for).
 */
export function buildTermSheetButtonLabels(deal: Deal, sheets: TermSheet[]): Record<string, string> {
  const valueBasis = conservativeValueBasis(
    deal.loanCategory,
    deal.purchasePrice ? Number(deal.purchasePrice) : null,
    deal.estimatedAsIsValue ? Number(deal.estimatedAsIsValue) : null
  );

  const labels: Record<string, string> = {};
  for (const sheet of sheets) {
    const fields = sheet.fields;
    const rate = numField(fields, "interestRate");
    const loanAmount = numField(fields, "loanAmount");
    const ltvPct = loanAmount !== null ? calculateLtv(loanAmount, valueBasis) : null;
    const typeLabel = loanTypeLabelForButton(deal, fields);

    const parts = [
      rate !== null ? formatRatePercent(rate) : null,
      typeLabel,
      ltvPct !== null ? `${formatPercent(ltvPct)} LTV` : null,
    ].filter((p): p is string => Boolean(p));

    labels[sheet.id] = parts.length ? parts.join(", ") : "View term sheet";
  }
  return labels;
}

/** Turns the lowest-to-highest summary fields into the borrower email's "quick breakdown" fact list. */
export function buildRateBreakdownHtml(templateKey: string, summary: Record<string, string>): string {
  const items =
    templateKey === "borrower_term_sheet_ready_dscr"
      ? [
          { label: "LTV", value: summary.ltvRange },
          { label: "Term", value: summary.loanTermRange },
          { label: "Loan type(s)", value: summary.loanTypeOptions },
          { label: "Prepayment penalty", value: summary.prepaymentPenaltyOptions },
        ]
      : [
          { label: "Loan amount", value: summary.loanAmountRange },
          { label: "Term", value: summary.loanTermRange },
          { label: "Loan type(s)", value: summary.loanTypeOptions },
        ];
  return htmlFactList(items);
}
