import { describe, expect, it } from "vitest";
import { lenderTurnSamples } from "../lender-turn-times";

const at = (s: string) => new Date(`2026-11-${s}:00Z`);
const req = (lenderId: string, sentAt: string | null, isQuickPricer = false) => ({
  lenderId,
  sentAt: sentAt ? at(sentAt) : null,
  isQuickPricer,
});
const ts = (lenderId: string, createdAt: string) => ({ lenderId, createdAt: at(createdAt) });

describe("lenderTurnSamples", () => {
  it("times a request from when it was sent to the term sheet that answered it", () => {
    const [s] = lenderTurnSamples([req("A", "03T12:00")], [ts("A", "04T12:00")]);
    expect(s.days).toBe(1);
  });

  it("times a re-price from the new request, not the original", () => {
    const samples = lenderTurnSamples(
      [req("A", "03T12:00"), req("A", "10T12:00")],
      [ts("A", "04T12:00"), ts("A", "11T00:00")]
    );
    expect(samples.map((s) => s.days)).toEqual([1, 0.5]);
  });

  it("counts only the first term sheet after a request, so extra products don't add slow samples", () => {
    const samples = lenderTurnSamples([req("A", "03T12:00")], [ts("A", "04T12:00"), ts("A", "08T12:00")]);
    expect(samples).toHaveLength(1);
    expect(samples[0].days).toBe(1);
  });

  it("ignores quick pricers and requests that were never sent", () => {
    expect(lenderTurnSamples([req("A", "03T12:00", true), req("A", null)], [ts("A", "04T12:00")])).toEqual([]);
  });

  it("does not credit one lender's term sheet to another lender's request", () => {
    expect(lenderTurnSamples([req("A", "03T12:00")], [ts("B", "04T12:00")])).toEqual([]);
  });

  it("gives no sample for a round that has no term sheet yet", () => {
    expect(lenderTurnSamples([req("A", "03T12:00")], [])).toEqual([]);
  });
});
