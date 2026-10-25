import { describe, expect, it } from "vitest";
import { REVIEW_EXPORT_HEADERS, reviewExportCells, reviewsToCsv, type ReviewExportRow } from "../review-export";

const row: ReviewExportRow = {
  client: "Andrew Smith",
  property: "7552 Wheat Rd, Jacksonville, FL 32244",
  loanNumber: 1006,
  status: "Answered",
  answeredOn: new Date("2026-10-25T12:00:00Z"),
  communication: 10,
  process: 9,
  speed: 8,
  terms: 10,
  recommend: 9,
  privateFeedback: 'Said "great", would like faster\nappraisals',
  publicReview: "Wonderful.",
  permission: true,
  onWebsite: false,
};

describe("review export", () => {
  it("has one cell per header, scores as numbers", () => {
    const cells = reviewExportCells(row);
    expect(cells).toHaveLength(REVIEW_EXPORT_HEADERS.length);
    expect(cells[5]).toBe(10);
    expect(cells[4]).toBe("2026-10-25");
  });
  it("leaves unanswered scores blank", () => {
    const cells = reviewExportCells({ ...row, communication: null, recommend: null, answeredOn: null });
    expect(cells[4]).toBe("");
    expect(cells[5]).toBe("");
    expect(cells[9]).toBe("");
  });
  it("writes a CSV Excel can open: BOM, quoting, doubled quotes, newlines kept inside quotes", () => {
    const csv = reviewsToCsv([row]);
    expect(csv.startsWith("﻿Client,Property")).toBe(true);
    expect(csv).toContain('"7552 Wheat Rd, Jacksonville, FL 32244"');
    expect(csv).toContain('"Said ""great"", would like faster\nappraisals"');
    expect(csv.trimEnd().split("\r\n")).toHaveLength(2);
  });
  it("defuses spreadsheet formulas typed into a review", () => {
    const csv = reviewsToCsv([{ ...row, publicReview: "=HYPERLINK(\"http://x\")" }]);
    expect(csv).not.toMatch(/,=HYPERLINK/);
  });
});
