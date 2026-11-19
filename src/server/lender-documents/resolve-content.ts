import Anthropic from "@anthropic-ai/sdk";
import { extractDocumentText, isPdfTextSparse, renderPdfPagesAsImages } from "@/server/lender-documents/extract-text";
import { detectImageMediaType } from "@/server/ai/image-media-type";

// Some lenders only ever hand over a screenshot of their rate sheet rather
// than a PDF — extractDocumentText can't pull text out of those (it only
// parses PDFs/spreadsheets/plain text). Rather than a separate OCR pass that
// transcribes the image to text first (lossy for a dense table), these get
// attached as real image content blocks, so the model reads the matrix
// directly the same way it already does for client-need document review
// elsewhere in this app.
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]);

export function isImageFile(fileName: string, mimeType: string): boolean {
  return SUPPORTED_IMAGE_TYPES.has(mimeType.toLowerCase()) || /\.(jpe?g|png|gif|webp)$/i.test(fileName);
}

export function isPdfFile(fileName: string, mimeType: string): boolean {
  return mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
}

export function imageBlock(doc: { mimeType: string; data: string }): Anthropic.ImageBlockParam {
  return {
    type: "image",
    source: { type: "base64", media_type: detectImageMediaType(doc.data, doc.mimeType), data: doc.data },
  };
}

export type DocContent =
  | { kind: "text"; text: string }
  | { kind: "images"; blocks: Anthropic.ImageBlockParam[]; source: "raw-image" }
  | { kind: "images"; blocks: Anthropic.ImageBlockParam[]; source: "scanned-pdf"; pageCount: number; totalPages: number }
  | { kind: "none" };

/**
 * Resolves one lender document to whatever the model can actually use:
 * a raw image goes straight through as an image block; a normal PDF/
 * spreadsheet extracts as text; a PDF that's really a stack of scanned page
 * images (no real text layer — extraction comes back as just pdf-parse's
 * "-- N of M --" page markers with nothing between them) falls back to
 * rendering its first several pages as images and reading those directly,
 * the same way a raw image is read. Shared by the per-deal lender-match
 * feature and the one-time structured-criteria extraction pass, so a lender
 * document is only ever read one way.
 */
export async function resolveDocContent(
  doc: { fileName: string; mimeType: string; data: string },
  // The per-deal lender match keeps the small defaults (it re-reads these on every run). The one-time criteria
  // extraction passes bigger limits so a multi-program package is read all the way through, not just its first pages.
  limits?: { maxChars?: number; maxScannedPages?: number }
): Promise<DocContent> {
  if (isImageFile(doc.fileName, doc.mimeType)) {
    return { kind: "images", blocks: [imageBlock(doc)], source: "raw-image" };
  }

  const text = await extractDocumentText(doc.fileName, doc.mimeType, doc.data, limits?.maxChars);
  if (text && !isPdfTextSparse(text)) {
    return { kind: "text", text };
  }

  if (isPdfFile(doc.fileName, doc.mimeType)) {
    const { pages, totalPages } = await renderPdfPagesAsImages(doc.data, limits?.maxScannedPages);
    if (pages.length) {
      return {
        kind: "images",
        source: "scanned-pdf",
        pageCount: pages.length,
        totalPages,
        blocks: pages.map((p) => ({
          type: "image",
          source: { type: "base64", media_type: p.mediaType, data: p.base64 },
        })),
      };
    }
  }

  return { kind: "none" };
}

export function headerNoteFor(content: DocContent, fileName: string, label: string): string | null {
  if (content.kind === "text") return `${label} excerpt:\n${content.text}`;
  if (content.kind === "none") return null;
  if (content.source === "raw-image") return `${label} image below ("${fileName}")`;
  const truncated = content.totalPages > content.pageCount ? ` (first ${content.pageCount} of ${content.totalPages} pages)` : "";
  return `${label} — scanned PDF rendered as page images below${truncated} ("${fileName}")`;
}

/**
 * What the one-time criteria extraction sends the model. A real PDF's text layer loses table layout (which value sits
 * on which row, which column of a side-by-side table), so for a PDF the model gets the text AND the page images and
 * is told to trust the images for any table. Spreadsheets, plain text and scanned/raw images go as before.
 */
export async function resolveExtractionBlocks(
  doc: { fileName: string; mimeType: string; data: string },
  limits: { maxChars: number; maxScannedPages: number }
): Promise<Anthropic.ContentBlockParam[] | null> {
  const content = await resolveDocContent(doc, limits);
  if (content.kind === "none") return null;
  if (content.kind === "images") return [{ type: "text", text: `Document "${doc.fileName}":` }, ...content.blocks];

  const blocks: Anthropic.ContentBlockParam[] = [];
  if (isPdfFile(doc.fileName, doc.mimeType)) {
    try {
      const { pages, totalPages } = await renderPdfPagesAsImages(doc.data, limits.maxScannedPages);
      if (pages.length) {
        blocks.push({
          type: "text",
          text:
            `Document "${doc.fileName}" (${totalPages} pages). Below are (1) the text pulled from the PDF, then (2) an image of each page` +
            `${pages.length < totalPages ? ` (the first ${pages.length})` : ""}. The text is reliable for wording but it often scrambles tables: ` +
            `rows and side-by-side columns can come out in the wrong order. For every table, read the row labels, column headers and values from the page images; ` +
            `if the text and an image disagree on a table value, the image is right.`,
        });
        blocks.push({ type: "text", text: `TEXT:\n${content.text}` });
        blocks.push(...pages.map((p) => ({ type: "image" as const, source: { type: "base64" as const, media_type: p.mediaType, data: p.base64 } })));
        return blocks;
      }
    } catch (err) {
      // Page images are an accuracy boost, not a requirement: fall back to the text alone.
      console.error("Couldn't render PDF pages for extraction, using text only:", err);
    }
  }
  return [{ type: "text", text: content.text }];
}
