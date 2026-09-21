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

// Same DSCR/Portfolio grouping as isRateBuydownCategory, exposed under its
// own name for callers (e.g. dashboard-metrics.ts) that care about "this
// category has a DSCR ratio" rather than "this category uses rate-buydown
// pricing" — the two happen to be the same set today, but for different
// reasons, so they're kept as separate named checks.
export function isDscrLikeCategory(category: string): boolean {
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

// A refinance has no purchase happening — the "purchase price" field on
// these deals (still shown per sectionsFor's showPurchasePrice) is really
// the property's *original* purchase price, a historical data point some
// lenders want, not what's being financed now. It must never be used as
// the deal's current value basis; only an actual purchase uses it. (Used
// to assume purchase price was simply absent on any refi — false in
// practice, and it produced wildly wrong LTVs, e.g. an old $125k purchase
// price used as the basis for a $240k-as-is-value refinance.)
export const REFINANCE_CATEGORIES = new Set(["dscr_cash_out_refinance", "dscr_rate_term_refinance", "bridge_refinance"]);

// DSCR and Bridge both use purchase price on a purchase, as-is value on a
// refinance — the term sheet PDF's own quoted LTV basis.
export function valueBasisFor(
  loanCategory: string,
  purchasePrice: number | null,
  estimatedAsIsValue: number | null
): number | null {
  if (REFINANCE_CATEGORIES.has(loanCategory)) return estimatedAsIsValue;
  return purchasePrice ?? estimatedAsIsValue ?? null;
}

// Conservative value basis for the deal-header/pipeline "how achievable is
// this" requested-LTV display: on a purchase, lenders anchor to whichever
// is lower, purchase price or the borrower's (often optimistic) as-is-value
// estimate; on a refinance, only as-is value ever applies.
export function conservativeValueBasis(
  loanCategory: string,
  purchasePrice: number | null,
  estimatedAsIsValue: number | null
): number | null {
  if (REFINANCE_CATEGORIES.has(loanCategory)) return estimatedAsIsValue;
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

// Same formula the generated term-sheet PDF uses (src/server/pdf/term-sheet.tsx)
// for the borrower's net cash position across the whole deal, both the
// closing table and whatever they've already paid out of pocket beforehand
// (appraisal, credit pull, processing fee). Deliberately excludes reserves
// (the PDF's separate "Cash to Show" figure) since reserves are a liquidity
// requirement, not cash actually changing hands.
//
// A purchase (or a hard-money draw loan) has the borrower bringing money to
// the table, so the return value is always ≥ the fees alone — positive,
// meaning cash due. A refinance nets the new loan's proceeds against the
// existing mortgage payoff and its own fees first: when that nets positive
// (the normal cash-out case), the borrower is receiving money overall, and
// this returns a NEGATIVE number — callers should read a negative result as
// "net cash to the borrower," not a cash requirement.
//
// Takes already-resolved dollar figures rather than raw term-sheet fields so
// each caller can supply numbers from whichever source fits its own
// lifecycle — the PDF resolves them once at generation time; the accepted
// deal header re-resolves them live, honoring any post-acceptance overrides
// (a renegotiated origination fee, a rate-locked processing fee, etc.).
export function calculateEstimatedCashToClose({
  loanCategory,
  purchasePrice,
  mortgagePayoffAmount = null,
  closingDisbursement,
  originationFee,
  costToBorrowerFee,
  underwritingDocFee,
  appraisalFee = STANDARD_APPRAISAL_ESTIMATE,
  creditPullFee = STANDARD_CREDIT_PULL_ESTIMATE,
  processingFee = STANDARD_PROCESSING_FEE,
}: {
  loanCategory: string;
  purchasePrice: number | null;
  mortgagePayoffAmount?: number | null;
  closingDisbursement: number;
  originationFee: number;
  costToBorrowerFee: number;
  underwritingDocFee: number;
  appraisalFee?: number;
  creditPullFee?: number;
  processingFee?: number;
}): number {
  const paidPrior = appraisalFee + creditPullFee + processingFee;

  if (REFINANCE_CATEGORIES.has(loanCategory)) {
    // A refinance has no purchase happening, so purchasePrice (the
    // property's historical purchase price) never belongs in this math —
    // same trap valueBasisFor above already guards against for LTV. What
    // actually funds the closing is the new loan minus what it has to pay
    // off first and minus its own fees.
    const netProceeds =
      closingDisbursement - (mortgagePayoffAmount ?? 0) - originationFee - costToBorrowerFee - underwritingDocFee;
    return paidPrior - netProceeds;
  }

  const downPayment = purchasePrice !== null ? purchasePrice - closingDisbursement : 0;
  const cashAtClosing = downPayment + originationFee + costToBorrowerFee + underwritingDocFee;
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
    const basis = valueBasisFor(category, purchasePrice, estimatedAsIsValue);
    return [{ label: "LTV", valuePct: calculateLtv(loanAmount, basis) }];
  }
  return [];
}
