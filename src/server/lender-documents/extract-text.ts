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

async function extractFromPdf(buffer: Buffer): Promise<string> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text;
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
