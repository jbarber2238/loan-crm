import { LOAN_CATEGORIES } from "@/lib/labels";

// Which loan types a deal can be quoted — and, if the borrower signs, switched
// to — from its current one. A term sheet for a different loan type than the
// deal's current one is how a borrower seeking, say, a cash-out refinance gets
// offered rate & term instead. Anything not listed here can only be quoted as
// its own type.
const CHANGES: Record<string, string[]> = {
  dscr_purchase: ["fix_and_flip", "bridge_purchase"],
  dscr_cash_out_refinance: ["dscr_rate_term_refinance", "bridge_refinance", "fix_and_flip"],
  dscr_rate_term_refinance: ["dscr_cash_out_refinance", "fix_and_flip", "bridge_refinance"],
};

/** The deal's own loan type first, then everything it's allowed to change to. */
export function allowedTermSheetCategories(current: string): string[] {
  return [current, ...(CHANGES[current] ?? [])];
}

export function canChangeLoanType(from: string, to: string): boolean {
  return from !== to && (CHANGES[from] ?? []).includes(to);
}

export function loanCategoryLabel(category: string): string {
  return LOAN_CATEGORIES.find((c) => c.value === category)?.label ?? category;
}
