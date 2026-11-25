import { eq } from "drizzle-orm";
import { renderToBuffer } from "@react-pdf/renderer";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { companySettings, deals } from "@/server/db/schema";
import { BrokerInvoicePdf } from "@/server/pdf/broker-invoice";
import {
  brokerInvoiceBillTo,
  brokerInvoiceBlocker,
  brokerInvoiceClosingAgent,
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
      titleCompanyAgentName: true,
      titleAgentEmail: true,
      titleAgentPhone: true,
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
    columns: { name: true, legalName: true, nmlsId: true, logoMimeType: true, logoData: true, logoIsLight: true },
  });
  const logoSrc =
    company?.logoData && company.logoMimeType && PDF_IMAGE_TYPES.has(company.logoMimeType)
      ? `data:${company.logoMimeType};base64,${company.logoData}`
      : null;

  const buffer = await renderToBuffer(
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
      closingAgent: brokerInvoiceClosingAgent({
        company: deal.titleCompanyName,
        agent: deal.titleCompanyAgentName,
        email: deal.titleAgentEmail,
        phone: deal.titleAgentPhone,
      }),
      borrowerName: deal.borrowerName,
      propertyAddress: deal.propertyAddress,
      loanTypeLabel: labelFor(LOAN_CATEGORIES, deal.loanCategory),
      loanNumber: deal.loanNumber,
      fee: brokerInvoiceFee(
        approvedLoanAmount,
        deal.originationPointsOverride !== null ? Number(deal.originationPointsOverride) : null
      ),
    })
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition("attachment", brokerInvoiceFileName(deal.propertyAddress)),
      // Always rebuilt: the terms, the lock and the date can all change between downloads.
      "Cache-Control": "private, no-store",
    },
  });
}
