export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

const VALID: ImageMediaType[] = ["image/jpeg", "image/png", "image/gif", "image/webp"];

/**
 * Anthropic's API validates that the declared media_type actually matches the
 * image bytes and rejects the request if they don't (seen in practice: a
 * lender's screenshot saved/renamed with a mismatched extension, e.g. a JPEG
 * whose file got labeled image/png somewhere upstream). Sniff the real format
 * from the file's magic bytes instead of trusting whatever MIME type it
 * arrived with.
 */
export function detectImageMediaType(base64Data: string, declaredMimeType: string): ImageMediaType {
  // A handful of leading base64 chars (in groups of 4) decode to plenty of
  // bytes to check every magic number below without pulling in the whole file.
  const buffer = Buffer.from(base64Data.slice(0, 32), "base64");

  if (buffer.length >= 8 && buffer.subarray(0, 4).toString("hex") === "89504e47") {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 4 && buffer.subarray(0, 3).toString("ascii") === "GIF") {
    return "image/gif";
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  const normalized = declaredMimeType.toLowerCase() === "image/jpg" ? "image/jpeg" : declaredMimeType.toLowerCase();
  return VALID.includes(normalized as ImageMediaType) ? (normalized as ImageMediaType) : "image/jpeg";
}
