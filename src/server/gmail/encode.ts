// Building the raw email message (headers, base64 body, attachments). Pure, so it can be tested
// without a database or Gmail.

// Raw header bytes are read as ASCII/Latin-1 by mail parsers unless told
// otherwise — an em dash or any other non-ASCII character stuffed in
// unencoded is what produces garbled subjects like "Ã¢Â€Â"" in the inbox.
// RFC 2047's encoded-word form (=?UTF-8?B?...?=) is how a header signals
// "this is UTF-8." Plain ASCII values pass through untouched so headers
// stay readable in logs and don't grow a wrapper they don't need.
function encodeHeaderValue(value: string): string {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

// An attachment's name as a header parameter. A name with characters outside plain ASCII (a Mac screenshot's
// special space, an accent) goes as an ASCII fallback plus the real name in RFC 2231 form, so it survives intact.
export function attachmentNameParam(param: "name" | "filename", fileName: string): string {
  const clean = fileName.replace(/[\r\n]/g, " ").replace(/"/g, "");
  if (/^[\x20-\x7E]*$/.test(clean)) return `${param}="${clean}"`;
  const spaced = clean.replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, " ");
  const ascii = spaced.replace(/[^\x20-\x7E]/g, "_");
  const encoded = encodeURIComponent(spaced).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${param}="${ascii}"; ${param}*=UTF-8''${encoded}`;
}

export interface GmailAttachment {
  fileName: string;
  mimeType: string;
  /** Base64-encoded file content — the same encoding dealClientNeedDocuments.data is stored in, so no re-encoding is needed at the call site. */
  data: string;
}

// Splits a base64 attachment payload into 76-char lines — required by RFC
// 2045 for base64 message bodies; most mail servers reject (or silently
// mangle) a single unbroken base64 line for an attachment part.
function wrapBase64(data: string): string {
  return data.replace(/[\r\n]/g, "").match(/.{1,76}/g)?.join("\r\n") ?? data;
}

// A message body is sent as base64 with the transfer encoding declared. Without that, any non-ASCII
// character (an emoji, a curly quote, an em dash) travels as raw bytes, and mail apps that don't
// trust the charset line show it as garbage such as "üéâ" instead of the emoji.
export function encodeBodyBase64(body: string): string {
  return (Buffer.from(body, "utf-8").toString("base64").match(/.{1,76}/g) ?? []).join("\r\n");
}

export function encodeMessage({
  from,
  to,
  cc,
  replyTo,
  subject,
  body,
  html,
  attachments,
  extraHeaders,
}: {
  from: string;
  to: string;
  cc?: string | null;
  replyTo?: string | null;
  subject: string;
  body: string;
  html?: boolean;
  attachments?: GmailAttachment[];
  /** Whole header lines to add (e.g. List-Unsubscribe). Only ever built by our own code, never from user input. */
  extraHeaders?: string[];
}) {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    replyTo ? `Reply-To: ${replyTo}` : null,
    `Subject: ${encodeHeaderValue(subject)}`,
    "MIME-Version: 1.0",
    ...(extraHeaders ?? []),
  ].filter((line): line is string => line !== null);

  if (!attachments?.length) {
    const contentType = html ? "Content-Type: text/html; charset=utf-8" : "Content-Type: text/plain; charset=utf-8";
    const raw = [...headers, contentType, "Content-Transfer-Encoding: base64", "", encodeBodyBase64(body)].join("\r\n");
    return Buffer.from(raw).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  // With attachments, the message becomes multipart/mixed: one text/html (or
  // text/plain) part for the body, then one part per attachment with a
  // Content-Disposition telling the mail client to offer it as a download
  // rather than render it inline.
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const bodyContentType = html ? "text/html; charset=utf-8" : "text/plain; charset=utf-8";

  const parts = [
    `--${boundary}`,
    `Content-Type: ${bodyContentType}`,
    "Content-Transfer-Encoding: base64",
    "",
    encodeBodyBase64(body),
    ...attachments.flatMap((a) => [
      `--${boundary}`,
      `Content-Type: ${a.mimeType}; ${attachmentNameParam("name", a.fileName)}`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; ${attachmentNameParam("filename", a.fileName)}`,
      "",
      wrapBase64(a.data),
    ]),
    `--${boundary}--`,
  ];

  const raw = [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", ...parts].join("\r\n");
  return Buffer.from(raw).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
