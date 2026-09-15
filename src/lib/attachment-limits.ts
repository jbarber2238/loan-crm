// Gmail's outgoing message size limit (raw + attachments) sits around 25MB.
// Attachments go out base64-encoded (~1.33x inflation) plus a bit more for
// MIME headers/line-wrapping, so the *pre-encoding* file-size budget has to
// sit well under 25MB, not at it — 18MB of real file bytes lands the
// encoded message safely under the limit with room to spare.
export const GMAIL_SEND_LIMIT_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 18 * 1024 * 1024;

export function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
