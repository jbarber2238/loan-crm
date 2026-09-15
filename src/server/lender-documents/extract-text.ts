const MAX_EXTRACTED_CHARS = 4000;

function truncate(text: string) {
  return text.length > MAX_EXTRACTED_CHARS
    ? `${text.slice(0, MAX_EXTRACTED_CHARS)}\n…(truncated)`
    : text;
}

async function extractFromSpreadsheet(buffer: Buffer): Promise<string> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const parts: string[] = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (csv.trim()) parts.push(`Sheet "${sheetName}":\n${csv}`);
  }
  return parts.join("\n\n");
}

// pdfjs-dist (used internally by pdf-parse) references browser Canvas globals
// — DOMMatrix, Path2D, ImageData — even on its text-only extraction path, in
// versions 4+. Node has no such globals, so without this the very first PDF
// parse throws "ReferenceError: DOMMatrix is not defined" in any real Node
// runtime (confirmed happening in Vercel's serverless functions — silently
// swallowed by extractDocumentText's catch-all, so every PDF was returning no
// text there while working fine in a plain local `tsx` run, which is a
// different Node setup than Vercel's bundled function). We never render to
// an actual canvas here, only extract text, so empty stub classes that
// satisfy pdf.js's internal `instanceof`/construction checks are sufficient
// — no need for a real (heavy, native) canvas implementation.
// pdf.js's own "no real Worker available" fallback tries to dynamically
// `import()` its separate pdf.worker.mjs file at runtime by a path pdf.js
// builds internally — Vercel's serverless file tracing doesn't pick that up
// as a dependency (it's not a static import it can see), so the worker file
// never makes it into the deployed function and that dynamic import 404s
// with "Setting up fake worker failed". Pre-loading the worker module
// ourselves via a real static import and registering it on `globalThis`
// is pdf.js's own documented way to skip that dynamic-import path entirely
// (it checks for this before ever attempting the import) — Next.js sees our
// literal import path here and bundles the file correctly.
async function ensurePdfjsNodeSetup() {
  const g = globalThis as unknown as Record<string, unknown>;
  if (typeof g.DOMMatrix === "undefined") {
    g.DOMMatrix = class DOMMatrix {};
  }
  if (typeof g.Path2D === "undefined") {
    g.Path2D = class Path2D {};
  }
  if (typeof g.ImageData === "undefined") {
    g.ImageData = class ImageData {};
  }
  if (typeof g.pdfjsWorker === "undefined") {
    g.pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  }
}

async function extractFromPdf(buffer: Buffer): Promise<string> {
  await ensurePdfjsNodeSetup();
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

const PAGE_MARKER_RE = /--\s*\d+\s*of\s*\d+\s*--/g;

/**
 * pdf-parse inserts a "-- N of M --" marker between every page's text
 * regardless of whether that page had any actual text — a scanned PDF (a
 * guideline doc that's really a stack of page images with no text layer)
 * comes back as just those markers with nothing real between them. Used to
 * decide when to fall back to rendering pages as images instead.
 */
export function isPdfTextSparse(text: string | null): boolean {
  if (!text) return true;
  return text.replace(PAGE_MARKER_RE, "").trim().length < 200;
}

// Kept deliberately small — each rendered page is a real chunk of vision
// input tokens (cost scales with pixel count), and this runs across every
// lender in a category on every re-run, not just once. Most lender
// guideline documents put their actual eligibility grid in the first few
// pages regardless of total length.
const MAX_SCANNED_PDF_PAGES = 4;

export interface RenderedPdfPage {
  pageNumber: number;
  base64: string;
  mediaType: "image/jpeg";
}

/**
 * Fallback for a scanned PDF with no text layer: render its first several
 * pages to images and let the model read them directly the same way it
 * already reads a raw .jpg/.png lender document. Capped at
 * MAX_SCANNED_PDF_PAGES since a full multi-page guideline rendered at usable
 * resolution is a meaningful chunk of image tokens per page — most lender
 * matrices/guideline summaries put the actual criteria in the first few
 * pages regardless of total length.
 */
export async function renderPdfPagesAsImages(
  base64Data: string
): Promise<{ pages: RenderedPdfPage[]; totalPages: number }> {
  await ensurePdfjsNodeSetup();
  const { PDFParse } = await import("pdf-parse");
  const sharp = (await import("sharp")).default;
  const buffer = Buffer.from(base64Data, "base64");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getScreenshot({
      first: MAX_SCANNED_PDF_PAGES,
      // Still legible for a dense matrix table at a fraction of the vision
      // token cost of the original 1400px — image cost scales with pixel
      // count, so this and the quality setting below matter a lot when
      // multiplied across every lender's documents on every run.
      desiredWidth: 1100,
      imageBuffer: true,
      imageDataUrl: false,
    });
    const pages: RenderedPdfPage[] = [];
    for (const page of result.pages) {
      const jpeg = await sharp(Buffer.from(page.data)).jpeg({ quality: 76 }).toBuffer();
      pages.push({ pageNumber: page.pageNumber, base64: jpeg.toString("base64"), mediaType: "image/jpeg" });
    }
    return { pages, totalPages: result.total };
  } finally {
    await parser.destroy();
  }
}

/**
 * Best-effort text extraction so the AI intake check (§8) can reference
 * uploaded lender documents. Returns null for types we don't parse (e.g.
 * images, .docx) — those documents are still stored and downloadable, just
 * not fed into the AI prompt.
 */
export async function extractDocumentText(
  fileName: string,
  mimeType: string,
  base64Data: string
): Promise<string | null> {
  const buffer = Buffer.from(base64Data, "base64");
  const lowerName = fileName.toLowerCase();

  try {
    if (
      mimeType.includes("spreadsheet") ||
      mimeType === "application/vnd.ms-excel" ||
      /\.(xlsx|xls|csv)$/.test(lowerName)
    ) {
      return truncate(await extractFromSpreadsheet(buffer));
    }

    if (mimeType === "application/pdf" || lowerName.endsWith(".pdf")) {
      return truncate(await extractFromPdf(buffer));
    }

    if (mimeType.startsWith("text/") || lowerName.endsWith(".txt")) {
      return truncate(buffer.toString("utf-8"));
    }
  } catch {
    return null;
  }

  return null;
}
