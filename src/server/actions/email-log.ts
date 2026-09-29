"use server";

import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import { emailLogEntries } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";

export interface EmailLogEntry {
  id: string;
  sentAt: Date;
  sentByUserId: string | null;
  sentByUserName: string | null;
  toEmail: string;
  ccEmail: string | null;
  subject: string;
  bodyHtml: string;
  category: string;
}

export async function getEmailLogForDeal(dealId: string): Promise<EmailLogEntry[]> {
  await requireUser();
  const rows = await db.query.emailLogEntries.findMany({
    where: eq(emailLogEntries.dealId, dealId),
    with: { sentByUser: { columns: { name: true } } },
    orderBy: desc(emailLogEntries.sentAt),
  });
  return rows.map((r) => ({
    id: r.id,
    sentAt: r.sentAt,
    sentByUserId: r.sentByUserId,
    sentByUserName: r.sentByUser?.name ?? null,
    toEmail: r.toEmail,
    ccEmail: r.ccEmail,
    subject: r.subject,
    bodyHtml: r.bodyHtml,
    category: r.category,
  }));
}

export interface ReminderAuditEntry {
  sentAt: Date;
  category: string;
  senderName: string | null;
}

// Reminder emails are grouped per-sender and can cover several needs' items
// in one message (see client-needs-auto-reminders.ts), so "how many times
// was this need reminded about" means "how many logged emails had this
// need's id in their needIds array" — filtered in JS rather than a jsonb
// containment query since a deal's email volume is small.
export async function getClientNeedReminderAudit(dealId: string, needId: string): Promise<ReminderAuditEntry[]> {
  await requireUser();
  const rows = await db.query.emailLogEntries.findMany({
    where: (e, { and, eq: eqE }) =>
      and(eqE(e.dealId, dealId), inArray(e.category, ["client_needs_update", "client_needs_reminder_auto"])),
    with: { sentByUser: { columns: { name: true } } },
    orderBy: desc(emailLogEntries.sentAt),
  });
  return rows
    .filter((r) => r.needIds?.includes(needId))
    .map((r) => ({ sentAt: r.sentAt, category: r.category, senderName: r.sentByUser?.name ?? null }));
}
