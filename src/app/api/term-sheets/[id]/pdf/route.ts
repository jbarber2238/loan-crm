import { eq } from "drizzle-orm";
import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "@/server/db/client";
import { termSheets } from "@/server/db/schema";
import { TermSheetPdf } from "@/server/pdf/term-sheet";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const forSignature = new URL(request.url).searchParams.get("forSignature") === "1";

  // Only the columns TermSheetPdf actually reads below — not the full deal
  // row. The deals table has 100+ columns, and Postgres hard-caps functions
  // like json_build_array (which Drizzle's relational query builder uses to
  // embed a nested row) at 100 arguments; embedding the whole row here
  // throws "cannot pass more than 100 arguments to a function" in production.
  const termSheet = await db.query.termSheets.findFirst({
    where: eq(termSheets.id, id),
    with: {
      deal: {
        columns: {
          borrowerName: true,
          borrowerEntityName: true,
          propertyAddress: true,
          loanCategory: true,
          purchasePrice: true,
          mortgagePayoffAmount: true,
          estimatedAsIsValue: true,
          annualTaxes: true,
          annualInsurance: true,
          annualHoa: true,
          currentRent: true,
        },
      },
    },
  });

  if (!termSheet) {
    return new Response("Not found", { status: 404 });
  }

  const buffer = await renderToBuffer(
    TermSheetPdf({
      borrowerName: termSheet.deal.borrowerName,
      borrowerEntityName: termSheet.deal.borrowerEntityName,
      propertyAddress: termSheet.deal.propertyAddress,
      loanCategory: termSheet.deal.loanCategory,
      generatedAt: termSheet.createdAt,
      fields: termSheet.fields,
      purchasePrice: termSheet.deal.purchasePrice ? Number(termSheet.deal.purchasePrice) : null,
      mortgagePayoffAmount: termSheet.deal.mortgagePayoffAmount ? Number(termSheet.deal.mortgagePayoffAmount) : null,
      estimatedAsIsValue: termSheet.deal.estimatedAsIsValue ? Number(termSheet.deal.estimatedAsIsValue) : null,
      annualTaxes: termSheet.deal.annualTaxes ? Number(termSheet.deal.annualTaxes) : null,
      annualInsurance: termSheet.deal.annualInsurance ? Number(termSheet.deal.annualInsurance) : null,
      annualHoa: termSheet.deal.annualHoa ? Number(termSheet.deal.annualHoa) : null,
      currentRent: termSheet.deal.currentRent ? Number(termSheet.deal.currentRent) : null,
      forSignature,
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
