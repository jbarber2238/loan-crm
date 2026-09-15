/**
 * Term-sheet field definitions per loan category. `term_sheets.fields` is
 * stored as JSON keyed by `TermSheetField.key`, so the field lists below are
 * the single source of truth for both the data-entry form and the generated
 * PDF — add/remove a field here and both follow automatically.
 */

import { rehabOrConstructionBudgetLabel, isInterestOnlyCategory } from "@/lib/loan-sections";

export type TermSheetFieldType =
  | "text"
  | "textarea"
  | "number"
  | "currency"
  | "percent"
  | "select"
  | "url";

export interface TermSheetField {
  key: string;
  label: string;
  type: TermSheetFieldType;
  options?: string[];
  adminOnly?: boolean;
  helperText?: string;
  defaultValue?: string;
}

const DSCR_CATEGORIES = new Set(["dscr_purchase", "dscr_cash_out_refinance", "dscr_rate_term_refinance"]);
const BRIDGE_CATEGORIES = new Set(["bridge_purchase", "bridge_refinance"]);
const HARD_MONEY_DRAW_CATEGORIES = new Set(["fix_and_flip", "new_construction"]);

// Fix-and-flip/new-construction/bridge are short-term, interest-only loans
// quoted in months ("12 Months"); DSCR/Portfolio are long-term amortizing
// loans quoted in years ("30 Year Fixed"). Same underlying concept, two
// different units depending on category.
function loanTermField(category: string): TermSheetField {
  return isInterestOnlyCategory(category)
    ? { key: "loanTermMonths", label: "Loan Term (months)", type: "number" }
    : { key: "loanTermYears", label: "Loan Term (years)", type: "number" };
}

// Fields on every term sheet, regardless of loan category.
function baseFields(category: string): TermSheetField[] {
  return [
    { key: "loanAmount", label: "Total Loan Amount", type: "currency" },
    { key: "interestRate", label: "Interest Rate", type: "percent" },
    loanTermField(category),
    {
      key: "amortizationType",
      label: "Amortization",
      type: "text",
      helperText: "e.g. \"30 Year Fixed\" or \"5/6 ARM, 5 year fixed with 30-year amortization followed by floating rate\"",
    },
    { key: "prepaymentPenalty", label: "Prepayment Penalty", type: "text" },
    {
      key: "creditPullType",
      label: "Credit Pull Type",
      type: "select",
      options: ["Soft", "Hard"],
    },
    {
      key: "lienPosition",
      label: "Lien Position",
      type: "select",
      options: ["1st position", "2nd position"],
      defaultValue: "1st position",
      helperText: "Only change this for an explicit second-position DSCR loan — otherwise it's always 1st.",
    },
  ];
}

// The Cost to Borrower slot means something different depending on product:
// a discretionary rate buydown on DSCR, or the lender's own origination
// points on a hard money loan. Same storage key either way.
function costToBorrowerField(category: string): TermSheetField {
  const isRateBuydown = DSCR_CATEGORIES.has(category) || category === "portfolio";
  const label = isRateBuydown ? "Rate Buydown Fee" : "Lender Fee";
  return {
    key: "costToBorrowerFee",
    label,
    type: "currency",
    helperText: isRateBuydown ? "Rate Buydown Points × loan amount — computed automatically." : undefined,
  };
}

function feesFields(category: string): TermSheetField[] {
  const isRateBuydown = DSCR_CATEGORIES.has(category) || category === "portfolio";

  return [
    {
      key: "originationPoints",
      label: "Origination Points",
      type: "percent",
      defaultValue: "2",
      helperText: "Defaults to 2% — change it and Origination Fee below recalculates automatically ($2,500 minimum either way).",
    },
    {
      key: "originationFee",
      label: "Origination Fee",
      type: "currency",
      helperText: "Origination Points × loan amount, $2,500 minimum — computed automatically.",
    },
    // Only DSCR/Portfolio's "Rate Buydown Fee" is points-based — Bridge/hard
    // money's "Lender Fee" is a flat quoted amount with no points concept.
    ...(isRateBuydown
      ? [
          {
            key: "rateBuydownPoints",
            label: "Rate Buydown Points",
            type: "percent" as const,
            defaultValue: "0",
            helperText: "Defaults to 0% (no buydown) — change it and Rate Buydown Fee below recalculates automatically.",
          },
        ]
      : []),
    costToBorrowerField(category),
    {
      key: "underwritingDocFee",
      label: "Underwriting and Doc Fee",
      type: "currency",
      helperText: "Combine whatever the lender itemizes here (processing, underwriting, admin, doc prep).",
    },
  ];
}

function hardMoneyDrawFields(category: string): TermSheetField[] {
  return [
    { key: "initialAdvance", label: "Initial Advance", type: "currency" },
    { key: "approvedRehabCost", label: rehabOrConstructionBudgetLabel(category), type: "currency" },
    { key: "approvedArv", label: "Approved ARV (After Repair Value)", type: "currency" },
    {
      key: "interestType",
      label: "Interest Type",
      type: "select",
      options: ["Dutch", "Non-Dutch"],
      defaultValue: "Non-Dutch",
      helperText:
        "Dutch: interest on the full loan amount from day one. Non-Dutch (default): interest on the initial advance only, until draws increase it.",
    },
  ];
}

function bridgeFields(): TermSheetField[] {
  return [
    { key: "exitStrategy", label: "Exit Strategy", type: "text" },
    { key: "extensionTerms", label: "Extension Terms", type: "text" },
  ];
}

// DSCR/Portfolio reserves are a standard months-of-PITIA formula. Hard money
// and bridge lenders each calculate reserves their own way (e.g. 10% of loan
// amount, 25% of rehab budget) — for those, just capture the lump sum they
// quote rather than trying to model every lender's formula.
function reservesFields(category: string): TermSheetField[] {
  if (DSCR_CATEGORIES.has(category) || category === "portfolio") {
    return [
      {
        key: "reservesMonths",
        label: "Reserves Required (months of PITIA)",
        type: "number",
        defaultValue: "6",
        helperText: "Defaults to 6 months of PITIA — lower it if the lender requires fewer.",
      },
    ];
  }
  return [
    {
      key: "reservesRequired",
      label: "Reserves Required",
      type: "currency",
      helperText:
        "Every lender calculates this differently (e.g. 10% of loan amount, 25% of rehab/construction budget) — enter the lump-sum amount they quote.",
    },
  ];
}

export const ADMIN_ONLY_FIELDS: TermSheetField[] = [
  { key: "internalRateSheetRef", label: "Internal Rate Sheet Ref", type: "text", adminOnly: true },
  { key: "yieldSpreadNotes", label: "Yield Spread / Comp Notes", type: "textarea", adminOnly: true },
];

export function termSheetFieldsFor(category: string): TermSheetField[] {
  const fields: TermSheetField[] = [...baseFields(category), ...feesFields(category)];

  if (HARD_MONEY_DRAW_CATEGORIES.has(category)) {
    fields.push(...hardMoneyDrawFields(category));
  } else if (BRIDGE_CATEGORIES.has(category)) {
    fields.push(...bridgeFields());
  }

  fields.push(...reservesFields(category));

  return fields;
}

// Shared by every place that accepts a submitted set of term-sheet fields —
// creating one, updating one, and editing a deal's already-accepted terms —
// so a value's type (number vs. text) is always interpreted the same way.
export function extractTermSheetFields(
  formData: FormData,
  category: string,
  isAdmin: boolean
): Record<string, unknown> {
  const fieldDefs = [...termSheetFieldsFor(category), ...(isAdmin ? ADMIN_ONLY_FIELDS : [])];
  const fields: Record<string, unknown> = {};
  for (const field of fieldDefs) {
    const value = formData.get(field.key);
    if (typeof value === "string" && value.trim().length) {
      const isNumeric = field.type === "number" || field.type === "percent" || field.type === "currency";
      fields[field.key] = isNumeric ? Number(value) : value.trim();
    }
  }
  return fields;
}
