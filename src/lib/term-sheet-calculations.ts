// Loan amount is always the input; every ratio below is a derived, read-only
// output — never entered directly. Kept as pure functions so both the term
// sheet form (live preview) and the generated PDF compute them identically.

const DSCR_CATEGORIES = new Set(["dscr_purchase", "dscr_cash_out_refinance", "dscr_rate_term_refinance"]);
const BRIDGE_CATEGORIES = new Set(["bridge_purchase", "bridge_refinance"]);
const HARD_MONEY_DRAW_CATEGORIES = new Set(["fix_and_flip", "new_construction"]);

export function originationFeeSuggestion(loanAmount: number): number {
  return Math.max(loanAmount * 0.02, 2500);
}

// The actual origination fee is always points × loan amount, $2,500 floor —
// origination points is the one thing ever entered/negotiated; the dollar
// fee is always a derived display, never typed in directly.
export function originationFeeForPoints(loanAmount: number, points: number): number {
  return Math.max(loanAmount * (points / 100), 2500);
}

// Rate buydown points work the same way as origination points — points is
// the negotiated input, the dollar fee is always derived — but with no
// $2,500 floor: a buydown genuinely can be $0 (no buydown at all).
export function rateBuydownFeeForPoints(loanAmount: number, points: number): number {
  return loanAmount * (points / 100);
}

// Only DSCR/Portfolio treat the "Cost to Borrower" slot as a points-based
// rate buydown — Bridge/hard-money's "Lender Fee" is a flat quoted amount
// with no points concept, so it stays directly editable there.
export function isRateBuydownCategory(category: string): boolean {
  return DSCR_CATEGORIES.has(category) || category === "portfolio";
}

// The dollar figure to actually show/send for "Cost to Borrower": derived
// from rate buydown points on DSCR/Portfolio, or the directly-entered value
// everywhere else.
export function effectiveCostToBorrowerFee(
  category: string,
  loanAmount: number,
  costToBorrowerFee: number | null,
  rateBuydownPointsOverride: number | null
): number | null {
  if (isRateBuydownCategory(category) && loanAmount > 0) {
    return rateBuydownFeeForPoints(loanAmount, rateBuydownPointsOverride ?? 0);
  }
  return costToBorrowerFee;
}

export interface LeadValue {
  amount: number;
  basisLabel: "Requested Loan Amount" | "Loan Amount";
  basisAmount: number;
}

// The pipeline board's "Lead Value" — what this deal is actually worth to
// close, tracked from the moment it comes in through to closed or lost.
// Before a term sheet is accepted there's no real number to work from yet,
// so it's a flat 2% estimate off the borrower's requested amount; once a
// term sheet's accepted, the deal has a real loan amount and (potentially
// negotiated) origination fee, so that becomes the actual dollar value.
export function leadValueFor({
  loanAmountRequested,
  approvedLoanAmount,
  originationPointsOverride,
}: {
  loanAmountRequested: number;
  approvedLoanAmount: number | null;
  originationPointsOverride: number | null;
}): LeadValue {
  if (approvedLoanAmount !== null && approvedLoanAmount > 0) {
    const amount = originationFeeForPoints(approvedLoanAmount, originationPointsOverride ?? 2);
    return { amount, basisLabel: "Loan Amount", basisAmount: approvedLoanAmount };
  }
  return {
    amount: loanAmountRequested * 0.02,
    basisLabel: "Requested Loan Amount",
    basisAmount: loanAmountRequested,
  };
}

// Standard estimates shown on every term sheet — not entered per deal.
// Both are estimates; if the real fee comes in lower, that's a win for the
// borrower.
export const STANDARD_APPRAISAL_ESTIMATE = 1000;
export const STANDARD_CREDIT_PULL_ESTIMATE = 130;

// Our own processing fee — always $999, not a per-lender number.
export const STANDARD_PROCESSING_FEE = 999;

// Standard fully-amortizing monthly Principal & Interest. Used as an
// estimate for reserves/DSCR even on interest-only or ARM structures —
// this is explicitly an estimate, not the final underwritten payment.
export function estimatedMonthlyPI(loanAmount: number, annualRatePct: number, termYears: number): number {
  const monthlyRate = annualRatePct / 100 / 12;
  const n = termYears * 12;
  if (!loanAmount || !annualRatePct || !termYears) return 0;
  if (monthlyRate === 0) return loanAmount / n;
  return (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
}

export function estimatedMonthlyPitia(
  monthlyPI: number,
  annualTaxes: number | null,
  annualInsurance: number | null,
  annualHoa: number | null
): number {
  return monthlyPI + (annualTaxes ?? 0) / 12 + (annualInsurance ?? 0) / 12 + (annualHoa ?? 0) / 12;
}

// DSCR/Portfolio reserves are months of PITIA — 6 by default, but some
// lenders require fewer; `months` is the editable term-sheet field, not a
// constant.
export function estimatedReservesRequired(monthlyPitia: number, months = 6): number {
  return monthlyPitia * months;
}

export function calculateDscrRatio(monthlyRent: number | null, monthlyPitia: number): number | null {
  if (!monthlyRent || !monthlyPitia) return null;
  return monthlyRent / monthlyPitia;
}

// DSCR and Bridge both use purchase price on a purchase, as-is value on a
// refinance (there's no purchase price to speak of on a refi).
export function valueBasisFor(purchasePrice: number | null, estimatedAsIsValue: number | null): number | null {
  return purchasePrice ?? estimatedAsIsValue ?? null;
}

// Conservative value basis for the deal-header's requested-LTV display:
// lenders anchor to whichever is lower, purchase price or the borrower's
// (often optimistic) as-is-value estimate. Falls back to whichever one
// exists if only one is present (e.g. no purchase price on a refinance).
export function conservativeValueBasis(
  purchasePrice: number | null,
  estimatedAsIsValue: number | null
): number | null {
  if (purchasePrice && estimatedAsIsValue) return Math.min(purchasePrice, estimatedAsIsValue);
  return purchasePrice ?? estimatedAsIsValue ?? null;
}

export function calculateLtv(loanAmount: number, valueBasis: number | null): number | null {
  if (!valueBasis) return null;
  return (loanAmount / valueBasis) * 100;
}

export function calculateLtarv(loanAmount: number, approvedArv: number | null): number | null {
  if (!approvedArv) return null;
  return (loanAmount / approvedArv) * 100;
}

export function calculateLtc(
  loanAmount: number,
  purchasePrice: number | null,
  approvedRehabCost: number | null
): number | null {
  const cost = (purchasePrice ?? 0) + (approvedRehabCost ?? 0);
  if (!cost) return null;
  return (loanAmount / cost) * 100;
}

// Same formula the generated term-sheet PDF uses for "Total Estimated Cash
// Due from Borrower" (src/server/pdf/term-sheet.tsx) — down payment (or
// draw-loan equivalent) plus every fee due either at or before closing.
// Deliberately excludes reserves (the PDF's separate "Cash to Show" figure)
// since reserves are a liquidity requirement, not cash actually due.
//
// Takes already-resolved dollar figures rather than raw term-sheet fields so
// each caller can supply numbers from whichever source fits its own
// lifecycle — the PDF resolves them once at generation time; the accepted
// deal header re-resolves them live, honoring any post-acceptance overrides
// (a renegotiated origination fee, a rate-locked processing fee, etc.).
export function calculateEstimatedCashToClose({
  purchasePrice,
  closingDisbursement,
  originationFee,
  costToBorrowerFee,
  underwritingDocFee,
  appraisalFee = STANDARD_APPRAISAL_ESTIMATE,
  creditPullFee = STANDARD_CREDIT_PULL_ESTIMATE,
  processingFee = STANDARD_PROCESSING_FEE,
}: {
  purchasePrice: number | null;
  closingDisbursement: number;
  originationFee: number;
  costToBorrowerFee: number;
  underwritingDocFee: number;
  appraisalFee?: number;
  creditPullFee?: number;
  processingFee?: number;
}): number {
  const downPayment = purchasePrice !== null ? purchasePrice - closingDisbursement : 0;
  const cashAtClosing = downPayment + originationFee + costToBorrowerFee + underwritingDocFee;
  const paidPrior = appraisalFee + creditPullFee + processingFee;
  return cashAtClosing + paidPrior;
}

export function calculateDutchMonthlyInterest(loanAmount: number, annualRatePct: number): number {
  return (loanAmount * (annualRatePct / 100)) / 12;
}

export function calculateInitialMonthlyInterest(initialAdvance: number, annualRatePct: number): number {
  return (initialAdvance * (annualRatePct / 100)) / 12;
}

export interface MonthlyPaymentEstimate {
  label: string;
  amount: number | null;
}

// DSCR/Portfolio get a full PITIA estimate (P&I + taxes/insurance/HOA);
// Bridge and hard-money draw loans are always interest-only in practice, so
// they (and any DSCR loan explicitly noted as interest-only in its
// amortization type) get a plain interest-only monthly payment instead.
// Both are estimates — the same caveat as estimatedMonthlyPI above.
export function estimatedMonthlyPaymentFor(
  category: string,
  {
    loanAmount,
    annualRatePct,
    loanTermYears,
    amortizationType,
    annualTaxes,
    annualInsurance,
    annualHoa,
  }: {
    loanAmount: number;
    annualRatePct: number | null;
    loanTermYears: number | null;
    amortizationType: string | null;
    annualTaxes: number | null;
    annualInsurance: number | null;
    annualHoa: number | null;
  }
): MonthlyPaymentEstimate {
  const isInterestOnly =
    HARD_MONEY_DRAW_CATEGORIES.has(category) ||
    BRIDGE_CATEGORIES.has(category) ||
    Boolean(amortizationType?.toLowerCase().includes("interest only"));

  if (isInterestOnly) {
    const amount =
      loanAmount && annualRatePct ? calculateDutchMonthlyInterest(loanAmount, annualRatePct) : null;
    return { label: "Monthly Payment (I/O)", amount };
  }

  const amount =
    loanAmount && annualRatePct && loanTermYears
      ? estimatedMonthlyPitia(
          estimatedMonthlyPI(loanAmount, annualRatePct, loanTermYears),
          annualTaxes,
          annualInsurance,
          annualHoa
        )
      : null;
  return { label: "PITIA", amount };
}

export interface RatioMetric {
  label: string;
  valuePct: number | null;
}

/** Which ratio(s) to show for a category, given the loan amount and deal/term-sheet figures already on hand. */
export function ratioMetricsFor(
  category: string,
  {
    loanAmount,
    purchasePrice,
    estimatedAsIsValue,
    approvedArv,
    approvedRehabCost,
  }: {
    loanAmount: number;
    purchasePrice: number | null;
    estimatedAsIsValue: number | null;
    approvedArv: number | null;
    approvedRehabCost: number | null;
  }
): RatioMetric[] {
  if (HARD_MONEY_DRAW_CATEGORIES.has(category)) {
    return [
      { label: "LTARV", valuePct: calculateLtarv(loanAmount, approvedArv) },
      { label: "LTC", valuePct: calculateLtc(loanAmount, purchasePrice, approvedRehabCost) },
    ];
  }
  if (DSCR_CATEGORIES.has(category) || BRIDGE_CATEGORIES.has(category) || category === "portfolio") {
    const basis = valueBasisFor(purchasePrice, estimatedAsIsValue);
    return [{ label: "LTV", valuePct: calculateLtv(loanAmount, basis) }];
  }
  return [];
}
