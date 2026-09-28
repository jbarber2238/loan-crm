import convert from "heic-convert";

const HEIC_TYPES = new Set(["image/heic", "image/heif"]);

/** True for a HEIC/HEIF mime type (case-insensitive) — the format iPhone photos upload as by default. */
export function isHeic(mimeType: string): boolean {
  return HEIC_TYPES.has(mimeType.toLowerCase());
}

function withJpegExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? `${fileName.slice(0, dot)}.jpg` : `${fileName}.jpg`;
}

/**
 * Converts a HEIC/HEIF upload to JPEG at the moment it's stored, so every
 * document in the system is already something both Claude's API and every
 * lender can open — no browser but Safari can even display HEIC inline, and
 * Claude's image blocks don't accept it at all. Non-HEIC files pass through
 * untouched. Conversion failures fall back to storing the original file
 * rather than losing the upload.
 */
export async function convertHeicIfNeeded(file: {
  fileName: string;
  mimeType: string;
  dataBase64: string;
}): Promise<{ fileName: string; mimeType: string; dataBase64: string }> {
  if (!isHeic(file.mimeType)) return file;
  try {
    const jpeg = await convert({ buffer: Buffer.from(file.dataBase64, "base64"), format: "JPEG", quality: 0.85 });
    return {
      fileName: withJpegExtension(file.fileName),
      mimeType: "image/jpeg",
      dataBase64: Buffer.from(jpeg).toString("base64"),
    };
  } catch (err) {
    console.error(`HEIC conversion failed for ${file.fileName}, storing the original file instead:`, err);
    return file;
  }
}
