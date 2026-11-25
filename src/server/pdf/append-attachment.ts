import { PDFDocument } from "pdf-lib";

// Adds an uploaded file to the end of a PDF we generated: a PDF contributes its own pages untouched, a PNG or
// JPEG gets a letter-size page to itself. Used to put the company's wire instructions behind the broker invoice
// exactly as the bank issued them, so no account number is ever retyped.

const LETTER: [number, number] = [612, 792];
const IMAGE_MARGIN = 36;

function kindOf(mimeType: string): "pdf" | "png" | "jpeg" | null {
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpeg";
  return null;
}

/**
 * How many pages this file would add, or 0 when it can't be added (an unsupported type, a damaged or
 * password-protected PDF). Call it first, so the document being built can say whether an attachment follows.
 */
export async function attachmentPageCount(bytes: Uint8Array, mimeType: string): Promise<number> {
  const kind = kindOf(mimeType);
  if (!kind) return 0;
  try {
    if (kind === "pdf") {
      const doc = await PDFDocument.load(bytes);
      return doc.isEncrypted ? 0 : doc.getPageCount();
    }
    const probe = await PDFDocument.create();
    await (kind === "png" ? probe.embedPng(bytes) : probe.embedJpg(bytes));
    return 1;
  } catch {
    return 0;
  }
}

/** The PDF with the file added after its last page. Throws if the file can't be added; check attachmentPageCount first. */
export async function appendAttachment(pdfBytes: Uint8Array, bytes: Uint8Array, mimeType: string): Promise<Uint8Array> {
  const kind = kindOf(mimeType);
  if (!kind) throw new Error(`Can't attach a ${mimeType} file to a PDF`);
  const pdf = await PDFDocument.load(pdfBytes);

  if (kind === "pdf") {
    const source = await PDFDocument.load(bytes);
    for (const page of await pdf.copyPages(source, source.getPageIndices())) pdf.addPage(page);
    return pdf.save();
  }

  const image = await (kind === "png" ? pdf.embedPng(bytes) : pdf.embedJpg(bytes));
  const page = pdf.addPage(LETTER);
  const maxWidth = LETTER[0] - IMAGE_MARGIN * 2;
  const maxHeight = LETTER[1] - IMAGE_MARGIN * 2;
  // Shrinks to fit the page but never enlarges a small image.
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, { x: (LETTER[0] - width) / 2, y: LETTER[1] - IMAGE_MARGIN - height, width, height });
  return pdf.save();
}
