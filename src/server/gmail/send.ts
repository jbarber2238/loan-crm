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

function encodeMessage({
  from,
  to,
  cc,
  subject,
  body,
  html,
}: {
  from: string;
  to: string;
  cc?: string | null;
  subject: string;
  body: string;
  html?: boolean;
}) {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    `Subject: ${encodeHeaderValue(subject)}`,
    "MIME-Version: 1.0",
    html ? "Content-Type: text/html; charset=utf-8" : "Content-Type: text/plain; charset=utf-8",
    "",
    body,
  ].filter((line): line is string => line !== null);

  return Buffer.from(lines.join("\r\n"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
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
  message: { to: string; cc?: string | null; subject: string; body: string; html?: boolean }
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
