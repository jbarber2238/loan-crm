import { google } from "googleapis";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { accounts } from "@/server/db/schema";

export class GmailNotConnectedError extends Error {
  constructor() {
    super(
      "This account hasn't granted Gmail send access yet. Sign out and sign back in, and accept the Gmail permission when Google asks."
    );
    this.name = "GmailNotConnectedError";
  }
}

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

function encodeMessage({
  from,
  to,
  cc,
  subject,
  body,
  html,
  attachments,
}: {
  from: string;
  to: string;
  cc?: string | null;
  subject: string;
  body: string;
  html?: boolean;
  attachments?: GmailAttachment[];
}) {
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    `Subject: ${encodeHeaderValue(subject)}`,
    "MIME-Version: 1.0",
  ].filter((line): line is string => line !== null);

  if (!attachments?.length) {
    const contentType = html ? "Content-Type: text/html; charset=utf-8" : "Content-Type: text/plain; charset=utf-8";
    const raw = [...headers, contentType, "", body].join("\r\n");
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
    "",
    body,
    ...attachments.flatMap((a) => [
      `--${boundary}`,
      `Content-Type: ${a.mimeType}; name="${a.fileName}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${a.fileName}"`,
      "",
      wrapBase64(a.data),
    ]),
    `--${boundary}--`,
  ];

  const raw = [...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", ...parts].join("\r\n");
  return Buffer.from(raw).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function getGmailAuthForUser(userId: string) {
  const account = await db.query.accounts.findFirst({
    where: and(eq(accounts.userId, userId), eq(accounts.provider, "google")),
  });

  if (!account?.refresh_token) {
    throw new GmailNotConnectedError();
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: account.refresh_token });
  return oauth2Client;
}

export async function sendGmailAs(
  userId: string,
  userEmail: string,
  message: {
    to: string;
    cc?: string | null;
    subject: string;
    body: string;
    html?: boolean;
    attachments?: GmailAttachment[];
  }
): Promise<{ id: string | null | undefined; threadId: string | null | undefined }> {
  const oauth2Client = await getGmailAuthForUser(userId);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodeMessage({ from: userEmail, ...message }),
    },
  });

  return { id: res.data.id, threadId: res.data.threadId };
}
