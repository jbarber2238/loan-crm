/**
 * The largest single document (borrower link or staff) that can be uploaded to a client need. Scanned bank statements
 * run past 15MB. Large files are sent in 3MB pieces, which the server accepts up to about 40MB (see staged-upload.ts).
 */
export const BORROWER_MAX_FILE_BYTES = 30 * 1024 * 1024;

/** What the person sees when something unexpected breaks on our side (the real reason is hidden in production). */
export const UPLOAD_FALLBACK_MESSAGE =
  "Something went wrong on our end and that file didn't go through. Please try once more, or email it to your loan officer.";

/** Turns an error caught from a server action into something a borrower can read. */
export function readableUploadError(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  // Production replaces a server error's message with React's generic text (error #441) and a digest.
  if (!message || /Server Components render|React error|digest/i.test(message)) return UPLOAD_FALLBACK_MESSAGE;
  return message;
}

export function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}
