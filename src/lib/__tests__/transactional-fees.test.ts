import { describe, expect, it } from "vitest";
import { defaultBrokerPoints, formatPoints, transactionalFees } from "@/lib/transactional-fees";

describe("defaultBrokerPoints", () => {
  it("is 0.50% from $100,000 and 0.25% from $500,000", () => {
    expect(defaultBrokerPoints(100_000)).toBe(0.5);
    expect(defaultBrokerPoints(499_999)).toBe(0.5);
    expect(defaultBrokerPoints(500_000)).toBe(0.25);
    expect(defaultBrokerPoints(1_000_000)).toBe(0.25);
  });
});

describe("transactionalFees", () => {
  it("charges the borrower 1.25% on $100k-$499,999", () => {
    const f = transactionalFees({ fundingAmount: 300_000, brokerPoints: null, sameDayFunding: false });
    expect(f.totalPoints).toBe(1.25);
    expect(f.lenderFee).toBe(2250);
    expect(f.brokerFee).toBe(1500);
    expect(f.totalFee).toBe(3750);
  });

  it("charges the borrower 1.00% on $500k-$1M", () => {
    const f = transactionalFees({ fundingAmount: 600_000, brokerPoints: null, sameDayFunding: false });
    expect(f.totalPoints).toBe(1);
    expect(f.brokerFee).toBe(1500);
    expect(f.totalFee).toBe(6000);
  });

  it("adds a 0.25% premium for same-day funding, all of it the broker's", () => {
    const standard = transactionalFees({ fundingAmount: 300_000, brokerPoints: null, sameDayFunding: true });
    expect(standard.totalPoints).toBe(1.5);
    expect(standard.brokerFee).toBe(2250);
    const big = transactionalFees({ fundingAmount: 600_000, brokerPoints: null, sameDayFunding: true });
    expect(big.totalPoints).toBe(1.25);
  });

  it("honors adjusted broker points and flags them as custom", () => {
    const f = transactionalFees({ fundingAmount: 300_000, brokerPoints: 0.4, sameDayFunding: false });
    expect(f.brokerFee).toBe(1200);
    expect(f.isCustomPoints).toBe(true);
    expect(transactionalFees({ fundingAmount: 300_000, brokerPoints: 0.5, sameDayFunding: false }).isCustomPoints).toBe(false);
  });

  it("flags amounts outside $100k-$1M", () => {
    expect(transactionalFees({ fundingAmount: 50_000, brokerPoints: null, sameDayFunding: false }).outsideStandardRange).toBe(true);
    expect(transactionalFees({ fundingAmount: 1_000_001, brokerPoints: null, sameDayFunding: false }).outsideStandardRange).toBe(true);
    expect(transactionalFees({ fundingAmount: 1_000_000, brokerPoints: null, sameDayFunding: false }).outsideStandardRange).toBe(false);
  });
});

describe("formatPoints", () => {
  it("trims trailing zeros", () => {
    expect(formatPoints(1.25)).toBe("1.25%");
    expect(formatPoints(0.5)).toBe("0.5%");
    expect(formatPoints(1)).toBe("1%");
  });
});
