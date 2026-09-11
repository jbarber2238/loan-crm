/**
 * Term-sheet field definitions per loan category. `term_sheets.fields` is
 * stored as JSON keyed by `TermSheetField.key`, so the field lists below are
 * the single source of truth for both the data-entry form and the generated
 * PDF — add/remove a field here and both follow automatically.
 */

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

// Fields on every term sheet, regardless of loan category.
function baseFields(): TermSheetField[] {
  return [
    { key: "loanAmount", label: "Total Loan Amount", type: "currency" },
    { key: "interestRate", label: "Interest Rate", type: "percent" },
    { key: "loanTermYears", label: "Loan Term (years)", type: "number" },
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
  const label = DSCR_CATEGORIES.has(category) || category === "portfolio" ? "Rate Buydown Fee" : "Lender Fee";
  return { key: "costToBorrowerFee", label, type: "currency" };
}

function feesFields(category: string): TermSheetField[] {
  return [
    {
      key: "originationFee",
      label: "Origination Fee",
      type: "currency",
      helperText: "Defaults to 2% of loan amount (or $2,500 minimum) — edit if you've negotiated a different rate for this borrower.",
    },
    costToBorrowerField(category),
    {
      key: "underwritingDocFee",
      label: "Underwriting and Doc Fee",
      type: "currency",
      helperText: "Combine whatever the lender itemizes here (processing, underwriting, admin, doc prep).",
    },
  ];
}

function processingFeeFields(): TermSheetField[] {
  return [
    {
      key: "processingFeePaymentLink",
      label: "Processing Fee Payment Link",
      type: "url",
      helperText: "Our own $999 processing fee is added automatically — just paste a payment link here.",
    },
  ];
}

function hardMoneyDrawFields(): TermSheetField[] {
  return [
    { key: "initialAdvance", label: "Initial Advance", type: "currency" },
    { key: "approvedRehabCost", label: "Approved Rehab / Construction Budget", type: "currency" },
    { key: "approvedArv", label: "Approved ARV (After Repair Value)", type: "currency" },
    {
      key: "interestType",
      label: "Interest Type",
      type: "select",
      options: ["Dutch", "Non-Dutch"],
      helperText:
        "Dutch: interest on the full loan amount from day one. Non-Dutch: interest on the initial advance only, until draws increase it.",
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
  const fields: TermSheetField[] = [...baseFields(), ...feesFields(category)];

  if (HARD_MONEY_DRAW_CATEGORIES.has(category)) {
    fields.push(...hardMoneyDrawFields());
  } else if (BRIDGE_CATEGORIES.has(category)) {
    fields.push(...bridgeFields());
  }

  fields.push(...reservesFields(category));
  fields.push(...processingFeeFields());

  return fields;
}
