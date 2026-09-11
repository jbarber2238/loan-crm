import { eq } from "drizzle-orm";
import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "@/server/db/client";
import { termSheets } from "@/server/db/schema";
import { TermSheetPdf } from "@/server/pdf/term-sheet";
import { getCompanyName } from "@/server/settings";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const termSheet = await db.query.termSheets.findFirst({
    where: eq(termSheets.id, id),
    with: { deal: true },
  });

  if (!termSheet) {
    return new Response("Not found", { status: 404 });
  }

  const companyName = await getCompanyName();
  const buffer = await renderToBuffer(
    TermSheetPdf({
      companyName,
      borrowerName: termSheet.deal.borrowerName,
      borrowerEntityName: termSheet.deal.borrowerEntityName,
      propertyAddress: termSheet.deal.propertyAddress,
      loanCategory: termSheet.deal.loanCategory,
      generatedAt: termSheet.createdAt,
      fields: termSheet.fields,
      purchasePrice: termSheet.deal.purchasePrice ? Number(termSheet.deal.purchasePrice) : null,
      estimatedAsIsValue: termSheet.deal.estimatedAsIsValue ? Number(termSheet.deal.estimatedAsIsValue) : null,
      annualTaxes: termSheet.deal.annualTaxes ? Number(termSheet.deal.annualTaxes) : null,
      annualInsurance: termSheet.deal.annualInsurance ? Number(termSheet.deal.annualInsurance) : null,
      annualHoa: termSheet.deal.annualHoa ? Number(termSheet.deal.annualHoa) : null,
      currentRent: termSheet.deal.currentRent ? Number(termSheet.deal.currentRent) : null,
    })
  );

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="term-sheet-${termSheet.id}.pdf"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
