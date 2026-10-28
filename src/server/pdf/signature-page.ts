import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

/**
 * Adds a "Signature page" to the end of an uploaded PDF so PandaDoc can turn it into a signable document.
 *
 * The signature and date are PandaDoc "Field Tags" ("{signature:Client_______}", curly braces) written as plain
 * text, the same trick the term sheet PDF uses (see createDocumentFromPdfUrl in src/server/pandadoc.ts): PandaDoc
 * finds the tag in the PDF's text and swaps it for a real, clickable field for the "Client" recipient. Putting them
 * on their own page means the fields can never land on top of the uploaded document's own words.
 */
export async function addSignaturePage(pdfBytes: Uint8Array, documentName: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(pdfBytes);
  const pages = pdf.getPages();
  if (pages.length === 0) throw new Error("That PDF has no pages");
  // Match the last page's size so the signature page doesn't look out of place when printed.
  const { width, height } = pages[pages.length - 1].getSize();
  const page = pdf.addPage([width, height]);

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = Math.max(54, width * 0.1);
  const ink = rgb(0.05, 0.05, 0.05);
  const muted = rgb(0.35, 0.35, 0.35);

  let y = height - margin - 10;
  page.drawText("Signature page", { x: margin, y, size: 20, font: bold, color: ink });
  y -= 26;
  // Names with characters Helvetica can't draw (curly quotes, accents beyond Latin-1) fall back to a plain label.
  const safeName = /^[\x20-\x7E\xA0-\xFF]*$/.test(documentName) ? documentName : "Document";
  page.drawText(safeName, { x: margin, y, size: 11, font: regular, color: muted, maxWidth: width - margin * 2 });
  y -= 70;

  page.drawText("{signature:Client_______}", { x: margin, y, size: 11, font: regular, color: ink });
  y -= 8;
  page.drawLine({ start: { x: margin, y }, end: { x: margin + 260, y }, thickness: 0.75, color: muted });
  y -= 14;
  page.drawText("Signature", { x: margin, y, size: 9, font: regular, color: muted });

  y -= 56;
  page.drawText("{date:Client}", { x: margin, y, size: 11, font: regular, color: ink });
  y -= 8;
  page.drawLine({ start: { x: margin, y }, end: { x: margin + 160, y }, thickness: 0.75, color: muted });
  y -= 14;
  page.drawText("Date", { x: margin, y, size: 9, font: regular, color: muted });

  return pdf.save();
}
