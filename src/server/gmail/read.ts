import { google, gmail_v1 } from "googleapis";
import { getGmailAuthForUser } from "@/server/gmail/send";

export interface GmailReplyAttachment {
  fileName: string;
  mimeType: string;
  dataBase64: string;
}

export interface GmailReply {
  from: string;
  receivedAt: Date;
  bodyText: string;
  attachments: GmailReplyAttachment[];
}

function headerValue(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeBase64Url(data: string): Buffer {
  return Buffer.from(data, "base64url");
}

interface WalkResult {
  textPlain: string | null;
  textHtml: string | null;
  attachmentParts: gmail_v1.Schema$MessagePart[];
}

function walkParts(part: gmail_v1.Schema$MessagePart | undefined, acc: WalkResult) {
  if (!part) return;

  if (part.filename && part.body?.attachmentId) {
    acc.attachmentParts.push(part);
  } else if (part.mimeType === "text/plain" && part.body?.data && !acc.textPlain) {
    acc.textPlain = decodeBase64Url(part.body.data).toString("utf-8");
  } else if (part.mimeType === "text/html" && part.body?.data && !acc.textHtml) {
    acc.textHtml = decodeBase64Url(part.body.data).toString("utf-8");
  }

  for (const child of part.parts ?? []) {
    walkParts(child, acc);
  }
}

/**
 * The newest message in the thread, if anything has arrived since we sent
 * the original one — i.e. message #2 onward, regardless of its From address.
 * (Not filtered by "not our own email": a lender rep's address will usually
 * differ from ours anyway, and address-matching is brittle — a reply-all,
 * an alias, or a self-test would all wrongly look like "no reply".)
 */
export async function getLatestThreadReply(userId: string, threadId: string): Promise<GmailReply | null> {
  const auth = await getGmailAuthForUser(userId);
  const gmail = google.gmail({ version: "v1", auth });

  const thread = await gmail.users.threads.get({ userId: "me", id: threadId, format: "full" });
  const messages = thread.data.messages ?? [];

  if (messages.length < 2) return null;

  const latest = messages[messages.length - 1];
  const acc: WalkResult = { textPlain: null, textHtml: null, attachmentParts: [] };

  if (latest.payload?.body?.data) {
    acc.textPlain = decodeBase64Url(latest.payload.body.data).toString("utf-8");
  }
  walkParts(latest.payload, acc);

  const bodyText = acc.textPlain ?? (acc.textHtml ? stripHtml(acc.textHtml) : "");

  const attachments: GmailReplyAttachment[] = [];
  for (const part of acc.attachmentParts) {
    if (!part.body?.attachmentId || !part.filename) continue;
    const attachment = await gmail.users.messages.attachments.get({
      userId: "me",
      messageId: latest.id!,
      id: part.body.attachmentId,
    });
    if (!attachment.data.data) continue;
    attachments.push({
      fileName: part.filename,
      mimeType: part.mimeType ?? "application/octet-stream",
      dataBase64: decodeBase64Url(attachment.data.data).toString("base64"),
    });
  }

  const dateHeader = headerValue(latest.payload?.headers, "Date");
  const receivedAt = dateHeader ? new Date(dateHeader) : new Date();

  return {
    from: headerValue(latest.payload?.headers, "From"),
    receivedAt: Number.isNaN(receivedAt.getTime()) ? new Date() : receivedAt,
    bodyText,
    attachments,
  };
}
