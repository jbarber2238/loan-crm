// Transactional (double close) pricing. The lender always takes 0.75%; the
// broker's own points depend on the funding size, and same-day funding adds a
// premium on top of the broker's points.

export const LENDER_POINTS = 0.75;
export const SAME_DAY_PREMIUM_POINTS = 0.25;
export const STANDARD_RANGE_MIN = 100_000;
// The smallest request the public intake form accepts. Raise or remove this
// (and the fee tiers above) if smaller deals are ever taken on.
export const MINIMUM_FUNDING_AMOUNT = 100_000;
export const STANDARD_RANGE_MAX = 1_000_000;

/** The broker's standard points: 0.50% from $100,000, 0.25% from $500,000. Below/above the standard range uses the nearest tier (editable per loan). */
export function defaultBrokerPoints(fundingAmount: number): number {
  return fundingAmount >= 500_000 ? 0.25 : 0.5;
}

export interface TransactionalFees {
  lenderPoints: number;
  /** The broker's base points (default for the size, or the adjusted number). */
  brokerBasePoints: number;
  /** Same-day premium points, 0 unless same-day funding. */
  premiumPoints: number;
  /** Base + premium: what the broker earns, in points. */
  brokerTotalPoints: number;
  /** Lender + broker: what the borrower is charged, in points. */
  totalPoints: number;
  lenderFee: number;
  /** The broker's portion in dollars — the "lead value". */
  brokerFee: number;
  totalFee: number;
  isCustomPoints: boolean;
  outsideStandardRange: boolean;
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function transactionalFees({
  fundingAmount,
  brokerPoints,
  sameDayFunding,
}: {
  fundingAmount: number;
  brokerPoints: number | null;
  sameDayFunding: boolean;
}): TransactionalFees {
  const brokerBasePoints = brokerPoints ?? defaultBrokerPoints(fundingAmount);
  const premiumPoints = sameDayFunding ? SAME_DAY_PREMIUM_POINTS : 0;
  const brokerTotalPoints = brokerBasePoints + premiumPoints;
  const totalPoints = LENDER_POINTS + brokerTotalPoints;
  const lenderFee = cents((fundingAmount * LENDER_POINTS) / 100);
  const brokerFee = cents((fundingAmount * brokerTotalPoints) / 100);
  return {
    lenderPoints: LENDER_POINTS,
    brokerBasePoints,
    premiumPoints,
    brokerTotalPoints,
    totalPoints,
    lenderFee,
    brokerFee,
    totalFee: cents(lenderFee + brokerFee),
    isCustomPoints: brokerPoints !== null && brokerPoints !== defaultBrokerPoints(fundingAmount),
    outsideStandardRange: fundingAmount < STANDARD_RANGE_MIN || fundingAmount > STANDARD_RANGE_MAX,
  };
}

/** "1.25%", "0.5%" — trims trailing zeros. */
export function formatPoints(points: number): string {
  return `${Number(points.toFixed(3))}%`;
}
