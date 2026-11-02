import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { documentViewUrl, isSpreadsheet } from "@/lib/spreadsheet-preview";
import { renderSpreadsheetHtml } from "@/server/spreadsheet-html";

describe("isSpreadsheet", () => {
  it("recognises Excel, OpenDocument and CSV by type or by name", () => {
    expect(isSpreadsheet("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "x.bin")).toBe(true);
    expect(isSpreadsheet("application/vnd.ms-excel", "x")).toBe(true);
    expect(isSpreadsheet("application/octet-stream", "Bank Statement.XLSX")).toBe(true);
    expect(isSpreadsheet("text/csv; charset=utf-8", "x")).toBe(true);
  });

  it("leaves PDFs, photos and Word files alone", () => {
    expect(isSpreadsheet("application/pdf", "a.pdf")).toBe(false);
    expect(isSpreadsheet("image/png", "a.png")).toBe(false);
    expect(isSpreadsheet("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "a.docx")).toBe(false);
  });

  it("sends spreadsheets to the table view and everything else to the file", () => {
    expect(documentViewUrl({ id: "1", mimeType: "application/vnd.ms-excel", fileName: "a.xls" })).toBe("/api/client-need-documents/1/preview");
    expect(documentViewUrl({ id: "1", mimeType: "application/pdf", fileName: "a.pdf" })).toBe("/api/client-need-documents/1");
  });
});

describe("renderSpreadsheetHtml", () => {
  function workbook(sheets: Record<string, unknown[][]>): Buffer {
    const wb = XLSX.utils.book_new();
    for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  }

  it("shows every sheet with a link bar and the cell values", async () => {
    const html = await renderSpreadsheetHtml(workbook({ Income: [["Month", "Amount"], ["Jan", 1200]], Expenses: [["Item"], ["Taxes"]] }), "p&l.xlsx");
    expect(html).toContain("<nav>");
    expect(html).toContain('href="#sheet-1"');
    expect(html).toContain("Income");
    expect(html).toContain("1200");
    expect(html).toContain("Taxes");
  });

  it("keeps a cell's own markup from becoming real markup", async () => {
    const html = await renderSpreadsheetHtml(workbook({ "A<b>": [["<script>alert(1)</script>", "<img src=x onerror=alert(1)>"]] }), "x.xlsx");
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<b>");
  });

  it("cuts very long sheets and says so", async () => {
    const rows = Array.from({ length: 1500 }, (_, i) => [`r${i}`]);
    const html = await renderSpreadsheetHtml(workbook({ Big: rows }), "big.xlsx");
    expect(html).toContain("Showing the first 1,000 rows");
    expect(html).toContain("r999");
    expect(html).not.toContain("r1000<");
  });

  it("explains itself when the file can't be read", async () => {
    expect(await renderSpreadsheetHtml(null, "bad.xlsx")).toContain("couldn't be shown here");
  });
});

describe("renderSpreadsheetHtml keeps an Excel file's look", () => {
  async function styledBook(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Form", { views: [{ showGridLines: false }] });
    ws.getColumn(1).width = 30;
    ws.mergeCells("A1:C1");
    ws.getCell("A1").value = "SECTION II: Entity Experience";
    ws.getCell("A1").font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
    ws.getCell("A2").value = "Total";
    ws.getCell("B2").value = 1250.5;
    ws.getCell("B2").numFmt = "$#,##0.00";
    ws.getCell("B2").border = { bottom: { style: "thin", color: { argb: "FF000000" } } };
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  it("carries over fills, fonts, merges, borders, widths and number formats", async () => {
    const html = await renderSpreadsheetHtml(await styledBook(), "form.xlsx");
    expect(html).toContain("background:#1F3864");
    expect(html).toContain("color:#FFFFFF");
    expect(html).toContain("font-weight:700");
    expect(html).toContain('colspan="3"');
    expect(html).toContain("border-bottom:1px solid #000000");
    expect(html).toContain("width:215px"); // 30 characters wide
    expect(html).toContain("$1,250.50");
    expect(html).not.toContain('class="grid"'); // the file turns gridlines off
  });

  it("still escapes cell text in the styled view", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("S").getCell("A1").value = "<img src=x onerror=alert(1)>";
    const html = await renderSpreadsheetHtml(Buffer.from(await wb.xlsx.writeBuffer()), "x.xlsx");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
  });
});
