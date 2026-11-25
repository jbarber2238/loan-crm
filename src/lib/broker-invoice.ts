import { originationFeeForPoints } from "@/lib/term-sheet-calculations";

// The broker invoice some lenders ask for before closing: one line, our origination fee, billed to the lender
// on the deal. Everything that decides whether it can be made and what it says lives here, so the header
// button, the download route and the PDF can never disagree.

export const STANDARD_ORIGINATION_POINTS = 2;

/** Why an invoice can't be made yet, most basic reason first. Null means it can. */
export type BrokerInvoiceBlocker = "no_lender" | "no_loan_amount" | "rate_not_locked";

export function brokerInvoiceBlocker(deal: {
  hasLender: boolean;
  approvedLoanAmount: number | null;
  rateLocked: boolean;
}): BrokerInvoiceBlocker | null {
  if (!deal.hasLender) return "no_lender";
  if (!deal.approvedLoanAmount || deal.approvedLoanAmount <= 0) return "no_loan_amount";
  // The loan amount and points can still move until the lock, so an earlier invoice could bill the wrong fee.
  if (!deal.rateLocked) return "rate_not_locked";
  return null;
}

export interface BrokerInvoiceFee {
  loanAmount: number;
  points: number;
  /** Whole dollars: the invoice always rounds to the nearest dollar. */
  fee: number;
  /** True when the $2,500 minimum set the fee instead of points times loan amount. */
  minimumApplied: boolean;
}

/** Same origination fee the deal header shows, rounded to the nearest dollar. */
export function brokerInvoiceFee(approvedLoanAmount: number, originationPointsOverride: number | null): BrokerInvoiceFee {
  const points = originationPointsOverride ?? STANDARD_ORIGINATION_POINTS;
  const byPoints = approvedLoanAmount * (points / 100);
  const fee = originationFeeForPoints(approvedLoanAmount, points);
  return { loanAmount: approvedLoanAmount, points, fee: Math.round(fee), minimumApplied: fee > byPoints };
}

export function brokerInvoiceNumber(loanNumber: number): string {
  return `INV-${loanNumber}`;
}

/** "Broker Invoice - 511 Chapman Street.pdf", with anything a file name can't carry stripped out. */
export function brokerInvoiceFileName(propertyAddress: string): string {
  const street = propertyAddress.split(",")[0].replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  return street ? `Broker Invoice - ${street}.pdf` : "Broker Invoice.pdf";
}

/** "$8,000.00": already whole dollars, written out the way an invoice shows an amount. */
export function invoiceMoney(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-US")}.00`;
}

/** 2 -> "2%", 1.75 -> "1.75%" */
export function pointsText(points: number): string {
  return `${Number(points.toFixed(3))}%`;
}

/** "2026-11-25" -> "November 25, 2026" */
export function longDate(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** "+12692677506" -> "(269) 267-7506". Anything that isn't a ten-digit US number is printed as entered. */
export function invoicePhone(phone: string | null): string | null {
  const raw = phone?.trim();
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  return ten.length === 10 ? `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}` : raw;
}
