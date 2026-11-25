import { describe, expect, it } from "vitest";
import {
  brokerInvoiceBillTo,
  brokerInvoiceBlocker,
  brokerInvoiceClosingAgent,
  brokerInvoiceFee,
  brokerInvoiceFileName,
  brokerInvoiceNumber,
  brokerInvoicePayee,
  invoiceMoney,
  invoicePhone,
  longDate,
  pointsText,
} from "@/lib/broker-invoice";

describe("brokerInvoiceBlocker", () => {
  const ready = { hasLender: true, approvedLoanAmount: 400000, rateLocked: true };

  it("allows the invoice once a lender, a loan amount and a locked rate are all there", () => {
    expect(brokerInvoiceBlocker(ready)).toBeNull();
  });

  it("blocks it while the rate is not locked", () => {
    expect(brokerInvoiceBlocker({ ...ready, rateLocked: false })).toBe("rate_not_locked");
  });

  it("reports the more basic gap first", () => {
    expect(brokerInvoiceBlocker({ hasLender: false, approvedLoanAmount: null, rateLocked: false })).toBe("no_lender");
    expect(brokerInvoiceBlocker({ ...ready, approvedLoanAmount: null, rateLocked: false })).toBe("no_loan_amount");
    expect(brokerInvoiceBlocker({ ...ready, approvedLoanAmount: 0 })).toBe("no_loan_amount");
  });
});

describe("brokerInvoiceFee", () => {
  it("uses the standard 2 points when nothing was negotiated", () => {
    expect(brokerInvoiceFee(400000, null)).toEqual({ loanAmount: 400000, points: 2, fee: 8000, minimumApplied: false });
  });

  it("rounds to the nearest dollar, up and down", () => {
    expect(brokerInvoiceFee(318775, 1.75).fee).toBe(5579); // 5,578.5625
    expect(brokerInvoiceFee(318720, 1.75).fee).toBe(5578); // 5,577.60
    expect(brokerInvoiceFee(287333, 2).fee).toBe(5747); // 5,746.66
    expect(brokerInvoiceFee(287320, 2).fee).toBe(5746); // 5,746.40
  });

  it("applies the $2,500 minimum on a small loan and says so", () => {
    expect(brokerInvoiceFee(100000, null)).toEqual({ loanAmount: 100000, points: 2, fee: 2500, minimumApplied: true });
    expect(brokerInvoiceFee(125000, 2).minimumApplied).toBe(false);
  });
});

describe("brokerInvoiceBillTo", () => {
  it("bills the borrowing entity", () => {
    expect(brokerInvoiceBillTo("Andrew Sample", "Sample Holdings LLC")).toBe("Sample Holdings LLC");
  });

  it("bills the borrower when there is no entity", () => {
    expect(brokerInvoiceBillTo("Andrew Sample", null)).toBe("Andrew Sample");
    expect(brokerInvoiceBillTo("Andrew Sample", "  ")).toBe("Andrew Sample");
  });
});

describe("brokerInvoiceClosingAgent", () => {
  it("lists the title company with its contact underneath", () => {
    expect(
      brokerInvoiceClosingAgent({ company: "Sample Title & Escrow", agent: "Pat Closer", email: "pat@example.com", phone: "+15550100199" })
    ).toEqual({ name: "Sample Title & Escrow", lines: ["Attn: Pat Closer", "pat@example.com", "(555) 010-0199"] });
  });

  it("drops the company from a contact entered as company / person", () => {
    expect(
      brokerInvoiceClosingAgent({ company: "Sample Title, Inc.", agent: "Sample Title, Inc. / PAT CLOSER", email: null, phone: null })
    ).toEqual({ name: "Sample Title, Inc.", lines: ["Attn: PAT CLOSER"] });
    expect(brokerInvoiceClosingAgent({ company: "Sample Title", agent: "Pat Closer - sample title", email: null, phone: null })).toEqual({
      name: "Sample Title",
      lines: ["Attn: Pat Closer"],
    });
    expect(brokerInvoiceClosingAgent({ company: "Sample Title", agent: "Sample Title", email: null, phone: null })).toEqual({
      name: "Sample Title",
      lines: [],
    });
  });

  it("uses the contact's name when no company is on file", () => {
    expect(brokerInvoiceClosingAgent({ company: " ", agent: "Pat Closer", email: null, phone: null })).toEqual({ name: "Pat Closer", lines: [] });
  });

  it("is left off when the loan has no title contact yet", () => {
    expect(brokerInvoiceClosingAgent({ company: null, agent: null, email: "pat@example.com", phone: null })).toBeNull();
  });
});

describe("brokerInvoicePayee", () => {
  it("names the legal entity ahead of the DBA", () => {
    expect(brokerInvoicePayee("Manna Lending", "VESBA Creative Capital LLC")).toBe("VESBA Creative Capital LLC dba Manna Lending");
  });

  it("is just the company name when there is no separate legal entity", () => {
    expect(brokerInvoicePayee("Manna Lending", null)).toBe("Manna Lending");
    expect(brokerInvoicePayee("Manna Lending", " ")).toBe("Manna Lending");
    expect(brokerInvoicePayee("Manna Lending", "manna lending")).toBe("Manna Lending");
  });
});

describe("invoice text", () => {
  it("numbers the invoice after the loan", () => {
    expect(brokerInvoiceNumber(1043)).toBe("INV-1043");
  });

  it("names the file after the street address", () => {
    expect(brokerInvoiceFileName("511 Chapman Street, Kalamazoo, MI 49001")).toBe("Broker Invoice - 511 Chapman Street.pdf");
    expect(brokerInvoiceFileName('12/14 "A" St: Unit <2>, Town')).toBe("Broker Invoice - 12 14 A St Unit 2.pdf");
    expect(brokerInvoiceFileName("")).toBe("Broker Invoice.pdf");
  });

  it("writes amounts in whole dollars", () => {
    expect(invoiceMoney(8000)).toBe("$8,000.00");
    expect(invoiceMoney(5578.6)).toBe("$5,579.00");
  });

  it("writes a US phone number the usual way and leaves anything else alone", () => {
    expect(invoicePhone("+12692677506")).toBe("(269) 267-7506");
    expect(invoicePhone("269-267-7506")).toBe("(269) 267-7506");
    expect(invoicePhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
    expect(invoicePhone("  ")).toBeNull();
    expect(invoicePhone(null)).toBeNull();
  });

  it("writes points and dates plainly", () => {
    expect(pointsText(2)).toBe("2%");
    expect(pointsText(1.75)).toBe("1.75%");
    expect(longDate("2026-11-25")).toBe("November 25, 2026");
    expect(longDate("2026-01-01")).toBe("January 1, 2026");
  });
});
