// Shared calculation engine for the Max Allowable Offer Calculator — the
// single source of truth used by both the page (max-offer-calculator.tsx)
// and the Excel export (max-offer-excel-export.ts) so the two can never
// drift from each other. Ported from the approved design handoff's
// calc.js/calc.test.js (test vectors live in max-offer-calc.test.ts).
//
// Max Allowable Offer is the headline: the user enters ARV, rehab, percent
// of ARV and months — not a purchase price. "Offer" below is the optional
// planned-offer comparison; when absent, every scenario runs at the MAO.

export const LTARV_CAP = 0.75; // hard ceiling most hard money lenders hold to, regardless of experience

export interface MaxOfferCalcInputs {
  arv: number;
  rehab: number;
  pctOfArv: number; // 0-1, the "percent of ARV" rule (default 0.70)
  months: number;
  rate: number; // 0-1, annual simple interest placeholder
  ltc: number; // 0-1, loan-to-cost
  annualTaxes: number;
  annualInsurance: number;
  miscPerMonth: number;
  acqPct: number; // 0-1, buying closing costs
  pointsPct: number; // 0-1, lender points
  sellPct: number; // 0-1, selling costs
  offer: number | null; // optional planned offer; null/0 means "not entered"
}

export type LimitedBy = "Loan-to-cost" | "Loan-to-ARV";

export interface ScenarioResult {
  price: number;
  loan: number;
  limitedBy: LimitedBy;
  interest: number;
  holding: number;
  acquisition: number;
  points: number;
  selling: number;
  totalCost: number;
  profit: number;
  cashIn: number;
  margin: number;
  cashOnCash: number;
}

export function scenario(i: MaxOfferCalcInputs, price: number): ScenarioResult {
  const { arv, rehab } = i;
  const loanByLtc = (price + rehab) * i.ltc;
  const loanByArv = arv * LTARV_CAP;
  const loan = Math.min(loanByLtc, loanByArv); // "up to" amount, never a quote
  const limitedBy: LimitedBy = loanByLtc <= loanByArv ? "Loan-to-cost" : "Loan-to-ARV";
  const interest = loan * i.rate * (i.months / 12); // simple interest on the full loan
  const holding = ((i.annualTaxes + i.annualInsurance) / 12 + i.miscPerMonth) * i.months;
  const acquisition = price * i.acqPct;
  const points = loan * i.pointsPct;
  const selling = arv * i.sellPct;
  const totalCost = price + rehab + acquisition + points + interest + holding;
  const profit = arv - selling - totalCost;
  const cashIn = totalCost - loan;
  return {
    price,
    loan,
    limitedBy,
    interest,
    holding,
    acquisition,
    points,
    selling,
    totalCost,
    profit,
    cashIn,
    margin: arv > 0 ? profit / arv : 0,
    cashOnCash: cashIn > 0 ? profit / cashIn : 0,
  };
}

export interface CalculateResult extends ScenarioResult {
  mao: number;
  atOffer: ScenarioResult;
}

export function calculate(i: MaxOfferCalcInputs): CalculateResult {
  const mao = Math.max(0, i.pctOfArv * i.arv - i.rehab); // Max Allowable Offer
  const price = i.offer && i.offer > 0 ? i.offer : mao; // active purchase price
  // Deliberately no trailing `price` here: the `...scenario(i, mao)` spread
  // already sets `.price` to mao (matching every other top-level field,
  // which is always the "at max" scenario). A `price` property added after
  // the spread would silently overwrite that with the active/offer price
  // instead — exactly the kind of same-name shadowing bug this comment is
  // here to stop someone from reintroducing.
  return { mao, ...scenario(i, mao), atOffer: scenario(i, price) };
}

export type MarginStatus = "on_target" | "thin" | "below_target";

// Target margin is 15-20% of ARV.
export function status(margin: number): MarginStatus {
  if (margin >= 0.15) return "on_target"; // "This deal pencils."
  if (margin >= 0.10) return "thin"; // "Tight. Try a lower price or a smaller rehab."
  return "below_target"; // "This deal does not pencil at this price."
}

export interface OfferVsMax {
  state: "over" | "under";
  difference: number;
  profitAtMax: number;
  profitAtOffer: number;
  profitChange: number;
  marginAtMax: number;
  marginAtOffer: number;
  breakEvenOffer: number;
}

// Offer above the max: how much profit is given up, and where profit hits zero.
export function offerVsMax(i: MaxOfferCalcInputs, offer: number): OfferVsMax {
  const mao = Math.max(0, i.pctOfArv * i.arv - i.rehab);
  const atMax = scenario(i, mao);
  const atOffer = scenario(i, offer);
  return {
    state: offer > mao + 0.5 ? "over" : "under",
    difference: offer - mao,
    profitAtMax: atMax.profit,
    profitAtOffer: atOffer.profit,
    profitChange: atOffer.profit - atMax.profit,
    marginAtMax: atMax.margin,
    marginAtOffer: atOffer.margin,
    breakEvenOffer: breakEven(i),
  };
}

export function breakEven(i: MaxOfferCalcInputs): number {
  if (scenario(i, 0).profit <= 0) return 0;
  let lo = 0;
  let hi = Math.max(i.arv * 1.5, 1);
  for (let k = 0; k < 50; k++) {
    const mid = (lo + hi) / 2;
    if (scenario(i, mid).profit > 0) lo = mid;
    else hi = mid;
  }
  return lo;
}

export interface StressPoint {
  drop: number;
  salePrice: number;
  profit: number;
  margin: number;
}

const DEFAULT_STRESS_DROPS = [0, 0.05, 0.10, 0.15];

// Stress test: sale price drops, costs and loan stay the same.
export function stressTest(i: MaxOfferCalcInputs, price: number, drops: number[] = DEFAULT_STRESS_DROPS): StressPoint[] {
  const s = scenario(i, price);
  return drops.map((d) => {
    const salePrice = i.arv * (1 - d);
    const profit = salePrice - salePrice * i.sellPct - s.totalCost;
    return { drop: d, salePrice, profit, margin: salePrice > 0 ? profit / salePrice : 0 };
  });
}

export const DEFAULTS: MaxOfferCalcInputs = {
  arv: 400000,
  rehab: 60000,
  pctOfArv: 0.70,
  months: 6,
  rate: 0.105,
  ltc: 0.90,
  annualTaxes: 3600,
  annualInsurance: 1500,
  miscPerMonth: 150,
  acqPct: 0.02,
  pointsPct: 0.02,
  sellPct: 0.07,
  offer: null,
};
