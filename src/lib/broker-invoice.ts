import { originationFeeForPoints } from "@/lib/term-sheet-calculations";

// The broker invoice some lenders ask for before closing: one line, our origination fee, billed to the
// borrower's entity. Everything that decides whether it can be made and what it says lives here, so the header
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

/** The invoice is billed to the borrowing entity; with no entity, to the borrower. */
export function brokerInvoiceBillTo(borrowerName: string, borrowerEntityName: string | null): string {
  return borrowerEntityName?.trim() || borrowerName.trim();
}

export interface BrokerInvoiceClosingAgent {
  /** The title company, or the contact's own name when no company is on file. */
  name: string;
  /** Contact lines under the name: the person, their email, their phone. */
  lines: string[];
}

/**
 * The invoice goes to title, who put the fee on the settlement statement and pay it out at funding. This is the
 * loan's title contact as a block for the invoice, or null when nothing is on file yet.
 */
export function brokerInvoiceClosingAgent(title: {
  company: string | null;
  agent: string | null;
  email: string | null;
  phone: string | null;
}): BrokerInvoiceClosingAgent | null {
  const company = title.company?.trim() || null;
  // The contact field is often filled in as "Company / Person"; the company is already the heading.
  const agentRaw = title.agent?.trim() || "";
  const at = company ? agentRaw.toLowerCase().indexOf(company.toLowerCase()) : -1;
  const agent =
    (at >= 0 && company ? agentRaw.slice(0, at) + agentRaw.slice(at + company.length) : agentRaw)
      .replace(/^[\s/|,;:-]+|[\s/|,;:-]+$/g, "")
      .trim() || null;
  const name = company ?? agent;
  if (!name) return null;
  const lines = [company && agent ? `Attn: ${agent}` : null, title.email?.trim() || null, invoicePhone(title.phone)];
  return { name, lines: lines.filter((line): line is string => Boolean(line)) };
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
