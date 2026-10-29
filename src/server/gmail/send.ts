import { google } from "googleapis";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { accounts, emailLogEntries } from "@/server/db/schema";
import { encodeMessage, type GmailAttachment } from "@/server/gmail/encode";

export class GmailNotConnectedError extends Error {
  constructor() {
    super(
      "This account hasn't granted Gmail send access yet. Sign out and sign back in, and accept the Gmail permission when Google asks."
    );
    this.name = "GmailNotConnectedError";
  }
}

export type { GmailAttachment } from "@/server/gmail/encode";

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
    replyTo?: string | null;
    subject: string;
    body: string;
    html?: boolean;
    attachments?: GmailAttachment[];
    extraHeaders?: string[];
    /** Which deal this email belongs to, for the deal's Email Log tab — omit for a send that isn't about any one deal (a staff invite, an affiliate invite). */
    dealId?: string | null;
    /** A key from EMAIL_LOG_CATEGORY_LABELS (src/lib/email-log-categories.ts) — every call site should pass a real one; falls back to "other" only as a safety net. */
    category?: string;
    /** Which specific client needs this email covered — only set for client_needs_update/client_needs_reminder_auto sends, so the per-need audit log can count reminders for one specific need. */
    needIds?: string[] | null;
  }
): Promise<{ id: string | null | undefined; threadId: string | null | undefined }> {
  const oauth2Client = await getGmailAuthForUser(userId);
  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  const { dealId, category, needIds, ...mailFields } = message;
  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: encodeMessage({ from: userEmail, ...mailFields }),
    },
  });

  // The send itself already succeeded — a logging hiccup must never look
  // like the email failed, so this is fire-and-forget from the caller's
  // point of view.
  try {
    await db.insert(emailLogEntries).values({
      dealId: dealId ?? null,
      sentByUserId: userId,
      toEmail: message.to,
      ccEmail: message.cc || null,
      subject: message.subject,
      bodyHtml: message.body,
      category: category ?? "other",
      needIds: needIds ?? null,
      gmailMessageId: res.data.id ?? null,
    });
  } catch (err) {
    console.error("Failed to write email log entry (the email itself still sent):", err);
  }

  return { id: res.data.id, threadId: res.data.threadId };
}
