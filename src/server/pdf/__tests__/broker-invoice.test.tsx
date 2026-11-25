import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { BrokerInvoicePdf, type BrokerInvoicePdfProps } from "@/server/pdf/broker-invoice";
import { brokerInvoiceFee, brokerInvoiceNumber, longDate } from "@/lib/broker-invoice";

const sample: BrokerInvoicePdfProps = {
  companyName: "Sample Lending Co",
  logoSrc: null,
  logoIsLight: false,
  companyNmlsId: null,
  invoiceNumber: brokerInvoiceNumber(1006),
  invoiceDate: longDate("2026-11-25"),
  lenderName: "Sample Lender Capital",
  contact: { name: "Sample Officer", email: "officer@example.com", phone: "555-010-0100" },
  borrowerName: "Sample Borrower",
  borrowerEntityName: "Sample Holdings LLC",
  propertyAddress: "7552 Wheat Rd, Jacksonville, FL 32244",
  loanTypeLabel: "DSCR Rate & Term Refinance",
  loanNumber: 1006,
  estimatedClosing: longDate("2026-12-04"),
  fee: brokerInvoiceFee(161700, 1.7),
};

// Set INVOICE_PREVIEW_OUT (and optionally INVOICE_PREVIEW_LOGO, a PNG) to save the page for a look.
describe("BrokerInvoicePdf", () => {
  it("renders a one-page PDF with and without a logo, and with the optional lines missing", async () => {
    const logoPath = process.env.INVOICE_PREVIEW_LOGO;
    const variants: BrokerInvoicePdfProps[] = [
      sample,
      {
        ...sample,
        borrowerEntityName: null,
        estimatedClosing: null,
        contact: { name: null, email: null, phone: null },
        fee: brokerInvoiceFee(65000, null),
      },
      ...(logoPath
        ? [{ ...sample, logoIsLight: true, logoSrc: `data:image/png;base64,${readFileSync(logoPath).toString("base64")}` }]
        : []),
    ];
    for (const [i, props] of variants.entries()) {
      const buffer = await renderToBuffer(BrokerInvoicePdf(props));
      expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      // One "/Type /Page" object per page (the "/Pages" tree node doesn't match).
      expect(buffer.toString("latin1").match(/\/Type\s*\/Page\b(?!s)/g)).toHaveLength(1);
      if (process.env.INVOICE_PREVIEW_OUT) writeFileSync(`${process.env.INVOICE_PREVIEW_OUT}-${i}.pdf`, buffer);
    }
  });
});
