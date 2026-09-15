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
export async function resolveDocContent(doc: { fileName: string; mimeType: string; data: string }): Promise<DocContent> {
  if (isImageFile(doc.fileName, doc.mimeType)) {
    return { kind: "images", blocks: [imageBlock(doc)], source: "raw-image" };
  }

  const text = await extractDocumentText(doc.fileName, doc.mimeType, doc.data);
  if (text && !isPdfTextSparse(text)) {
    return { kind: "text", text };
  }

  if (isPdfFile(doc.fileName, doc.mimeType)) {
    const { pages, totalPages } = await renderPdfPagesAsImages(doc.data);
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
