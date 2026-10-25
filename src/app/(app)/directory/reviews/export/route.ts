import { auth } from "@/server/auth";
import { getReviewRows, toExportRow } from "@/server/reviews-data";
import { REVIEW_EXPORT_HEADERS, reviewExportCells, reviewsToCsv } from "@/lib/review-export";

// Admins only. ?format=csv (default) or ?format=xlsx. Always every survey, not just what's on screen.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || !session.user.active || !session.user.isAdmin) return new Response("Unauthorized", { status: 401 });

  const format = new URL(request.url).searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const rows = (await getReviewRows()).map(toExportRow);
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    return new Response(reviewsToCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="client-reviews-${stamp}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Client reviews", { views: [{ state: "frozen", ySplit: 1, xSplit: 1 }] });
  sheet.addRow([...REVIEW_EXPORT_HEADERS]);
  for (const r of rows) sheet.addRow(reviewExportCells(r));

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.alignment = { vertical: "middle", wrapText: true };
  header.height = 34;
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF143D4A" } };
  });
  const widths = [24, 38, 8, 20, 13, 14, 16, 14, 16, 18, 48, 48, 14, 11];
  widths.forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  // The two notes columns wrap; the 0-10 columns are centered so they scan like a scorecard.
  for (const col of [11, 12]) sheet.getColumn(col).alignment = { vertical: "top", wrapText: true };
  for (const col of [6, 7, 8, 9, 10]) sheet.getColumn(col).alignment = { vertical: "top", horizontal: "center" };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: REVIEW_EXPORT_HEADERS.length } };

  const buffer = await workbook.xlsx.writeBuffer();
  return new Response(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="client-reviews-${stamp}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
}
