// The Client Reviews table as a spreadsheet: one row per survey, every 0-10 answer in its own column,
// and the two free-text answers (private feedback, public review) as the last notes columns.

export interface ReviewExportRow {
  client: string;
  property: string;
  loanNumber: number | null;
  status: string;
  answeredOn: Date | null;
  communication: number | null;
  process: number | null;
  speed: number | null;
  terms: number | null;
  recommend: number | null;
  privateFeedback: string | null;
  publicReview: string | null;
  permission: boolean;
  onWebsite: boolean;
}

export const REVIEW_EXPORT_HEADERS = [
  "Client",
  "Property",
  "Loan #",
  "Status",
  "Answered on",
  "Communication (0-10)",
  "Clarity of the process (0-10)",
  "Speed to close (0-10)",
  "Terms & lender match (0-10)",
  "Likelihood to recommend (0-10)",
  "Private feedback",
  "Public review",
  "Permission to use review",
  "On website",
] as const;

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const yesNo = (b: boolean) => (b ? "Yes" : "No");

/** One row as plain cell values, in header order (numbers stay numbers so a spreadsheet can average them). */
export function reviewExportCells(r: ReviewExportRow): (string | number)[] {
  return [
    r.client,
    r.property,
    r.loanNumber ?? "",
    r.status,
    day(r.answeredOn),
    r.communication ?? "",
    r.process ?? "",
    r.speed ?? "",
    r.terms ?? "",
    r.recommend ?? "",
    r.privateFeedback ?? "",
    r.publicReview ?? "",
    yesNo(r.permission),
    yesNo(r.onWebsite),
  ];
}

function csvCell(value: string | number): string {
  const text = String(value);
  // A cell starting with = + - @ would run as a formula when opened in Excel; a leading apostrophe-free guard is a tab.
  const safe = typeof value === "string" && /^[=+\-@]/.test(text) ? `\t${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** UTF-8 CSV with a byte-order mark so Excel reads accents and curly quotes correctly. */
export function reviewsToCsv(rows: ReviewExportRow[]): string {
  const lines = [REVIEW_EXPORT_HEADERS.map(csvCell).join(","), ...rows.map((r) => reviewExportCells(r).map(csvCell).join(","))];
  return "﻿" + lines.join("\r\n") + "\r\n";
}
