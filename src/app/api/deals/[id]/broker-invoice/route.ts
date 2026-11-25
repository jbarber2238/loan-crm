import { eq } from "drizzle-orm";
import { renderToBuffer } from "@react-pdf/renderer";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { companySettings, deals } from "@/server/db/schema";
import { BrokerInvoicePdf } from "@/server/pdf/broker-invoice";
import { appendAttachment, attachmentPageCount } from "@/server/pdf/append-attachment";
import {
  brokerInvoiceBillTo,
  brokerInvoiceBlocker,
  brokerInvoiceTitleCompany,
  brokerInvoiceFee,
  brokerInvoiceFileName,
  brokerInvoiceNumber,
  invoicePhone,
  longDate,
} from "@/lib/broker-invoice";
import { contentDisposition } from "@/lib/content-disposition";
import { etDay } from "@/lib/friday-schedule";
import { LOAN_CATEGORIES, labelFor } from "@/lib/labels";
import { DEFAULT_COMPANY_NAME } from "@/server/settings";

// react-pdf only reads these two image formats.
const PDF_IMAGE_TYPES = new Set(["image/png", "image/jpeg"]);

/**
 * The broker invoice for a deal's origination fee, built fresh on each download so it always matches the
 * accepted terms. Signed-in staff only. The rate-lock rule is enforced here as well as on the button: the
 * button's page can be stale, and the address could be opened directly.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !session.user.active) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });

  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, id),
    columns: {
      loanNumber: true,
      borrowerName: true,
      borrowerEntityName: true,
      propertyAddress: true,
      loanCategory: true,
      approvedLoanAmount: true,
      originationPointsOverride: true,
      rateLocked: true,
      titleCompanyName: true,
      deletedAt: true,
    },
    with: {
      // Only to know a lender has been chosen. Its name is never printed on the invoice.
      lender: { columns: { id: true } },
      assignedLoanOfficer: { columns: { name: true, email: true, phone: true } },
    },
  });
  if (!deal || (deal.deletedAt && !session.user.isAdmin)) return new Response("Not found", { status: 404 });

  const approvedLoanAmount = deal.approvedLoanAmount ? Number(deal.approvedLoanAmount) : null;
  const blocker = brokerInvoiceBlocker({
    hasLender: Boolean(deal.lender),
    approvedLoanAmount,
    rateLocked: deal.rateLocked,
  });
  if (blocker || !deal.lender || !approvedLoanAmount) {
    // 409 with the reason as a short code; the button turns it into the pop-up.
    return Response.json({ blocker: blocker ?? "no_loan_amount" }, { status: 409 });
  }

  const company = await db.query.companySettings.findFirst({
    where: eq(companySettings.id, "default"),
    columns: {
      name: true,
      legalName: true,
      nmlsId: true,
      logoMimeType: true,
      logoData: true,
      logoIsLight: true,
      wireInstructionsMimeType: true,
      wireInstructionsData: true,
    },
  });
  // The wire instructions file from Settings → Company goes behind the invoice exactly as uploaded. If there is
  // none, or it isn't a PDF or image we can add, the invoice goes out on its own and doesn't mention one.
  const wire =
    company?.wireInstructionsData && company.wireInstructionsMimeType
      ? { bytes: new Uint8Array(Buffer.from(company.wireInstructionsData, "base64")), mimeType: company.wireInstructionsMimeType }
      : null;
  const wireInstructionsAttached = wire !== null && (await attachmentPageCount(wire.bytes, wire.mimeType)) > 0;
  const logoSrc =
    company?.logoData && company.logoMimeType && PDF_IMAGE_TYPES.has(company.logoMimeType)
      ? `data:${company.logoMimeType};base64,${company.logoData}`
      : null;

  const invoice = await renderToBuffer(
    BrokerInvoicePdf({
      companyName: company?.name ?? DEFAULT_COMPANY_NAME,
      companyLegalName: company?.legalName?.trim() || null,
      logoSrc,
      logoIsLight: company?.logoIsLight ?? false,
      companyNmlsId: company?.nmlsId?.trim() || null,
      invoiceNumber: brokerInvoiceNumber(deal.loanNumber),
      invoiceDate: longDate(etDay(new Date())),
      billTo: brokerInvoiceBillTo(deal.borrowerName, deal.borrowerEntityName),
      contact: {
        name: deal.assignedLoanOfficer.name,
        email: deal.assignedLoanOfficer.email,
        phone: invoicePhone(deal.assignedLoanOfficer.phone),
      },
      titleCompany: brokerInvoiceTitleCompany(deal.titleCompanyName),
      borrowerName: deal.borrowerName,
      propertyAddress: deal.propertyAddress,
      loanTypeLabel: labelFor(LOAN_CATEGORIES, deal.loanCategory),
      loanNumber: deal.loanNumber,
      fee: brokerInvoiceFee(
        approvedLoanAmount,
        deal.originationPointsOverride !== null ? Number(deal.originationPointsOverride) : null
      ),
      wireInstructionsAttached,
    })
  );
  const pdf =
    wire && wireInstructionsAttached
      ? await appendAttachment(new Uint8Array(invoice), wire.bytes, wire.mimeType)
      : invoice;

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition("attachment", brokerInvoiceFileName(deal.propertyAddress)),
      // Always rebuilt: the terms, the lock and the date can all change between downloads.
      "Cache-Control": "private, no-store",
    },
  });
}
