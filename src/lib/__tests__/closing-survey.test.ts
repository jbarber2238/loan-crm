import { describe, expect, it } from "vitest";
import {
  CLOSING_SURVEY_DAYS,
  CLOSING_SURVEY_TEMPLATE_KEYS,
  average,
  canPublishReview,
  defaultReviewerName,
  isLowScore,
  netPromoterScore,
  npsBucket,
  offerReferralProgram,
  parseScore,
  requestDueAt,
} from "../closing-survey";

describe("cadence", () => {
  it("sends six requests, each with its own template", () => {
    expect(CLOSING_SURVEY_DAYS).toHaveLength(6);
    expect(CLOSING_SURVEY_TEMPLATE_KEYS).toHaveLength(6);
    expect(new Set(CLOSING_SURVEY_TEMPLATE_KEYS).size).toBe(6);
  });
  it("dates each request from the closing", () => {
    const start = new Date("2026-10-01T12:00:00Z");
    expect(requestDueAt(start, 0)?.toISOString()).toBe("2026-10-01T12:00:00.000Z");
    expect(requestDueAt(start, 3)?.toISOString()).toBe("2026-10-15T12:00:00.000Z");
    expect(requestDueAt(start, 5)?.toISOString()).toBe("2026-10-31T12:00:00.000Z");
    expect(requestDueAt(start, 6)).toBeNull();
  });
});

describe("parseScore", () => {
  it("accepts whole numbers 0 to 10 only", () => {
    expect(parseScore(0)).toBe(0);
    expect(parseScore("10")).toBe(10);
    expect(parseScore(11)).toBeNull();
    expect(parseScore(-1)).toBeNull();
    expect(parseScore(7.5)).toBeNull();
    expect(parseScore("")).toBeNull();
    expect(parseScore(null)).toBeNull();
    expect(parseScore("abc")).toBeNull();
  });
});

describe("recommend score", () => {
  it("buckets like a standard NPS", () => {
    expect(npsBucket(10)).toBe("promoter");
    expect(npsBucket(9)).toBe("promoter");
    expect(npsBucket(8)).toBe("passive");
    expect(npsBucket(7)).toBe("passive");
    expect(npsBucket(6)).toBe("detractor");
  });
  it("computes the net score", () => {
    expect(netPromoterScore([])).toBeNull();
    expect(netPromoterScore([10, 10, 8, 3])).toBe(25);
  });
  it("offers the referral program from 8 up", () => {
    expect(offerReferralProgram(8)).toBe(true);
    expect(offerReferralProgram(10)).toBe(true);
    expect(offerReferralProgram(7)).toBe(false);
    expect(offerReferralProgram(null)).toBe(false);
  });
});

describe("isLowScore", () => {
  const ok = { scoreCommunication: 9, scoreProcess: 9, scoreSpeed: 8, scoreTerms: 9, scoreRecommend: 9 };
  it("flags an unhappy recommend score or any very low rating", () => {
    expect(isLowScore(ok)).toBe(false);
    expect(isLowScore({ ...ok, scoreRecommend: 6 })).toBe(true);
    expect(isLowScore({ ...ok, scoreSpeed: 5 })).toBe(true);
    expect(isLowScore({ ...ok, scoreSpeed: 6 })).toBe(false);
  });
});

describe("reviews", () => {
  it("shortens names for public display", () => {
    expect(defaultReviewerName("Andrew Smith")).toBe("Andrew S.");
    expect(defaultReviewerName("Mary Ann van Dyke")).toBe("Mary D.");
    expect(defaultReviewerName("Cher")).toBe("Cher");
    expect(defaultReviewerName("  ")).toBe("A Manna client");
  });
  it("needs permission and words to publish", () => {
    expect(canPublishReview({ reviewPermission: true, publicReview: "Great" })).toBe(true);
    expect(canPublishReview({ reviewPermission: false, publicReview: "Great" })).toBe(false);
    expect(canPublishReview({ reviewPermission: true, publicReview: "  " })).toBe(false);
    expect(canPublishReview({ reviewPermission: true, publicReview: null })).toBe(false);
  });
  it("averages to one decimal", () => {
    expect(average([9, 10, null, 8])).toBe(9);
    expect(average([9, 8])).toBe(8.5);
    expect(average([null])).toBeNull();
  });
});
