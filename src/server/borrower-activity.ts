import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import { borrowerActivityEvents, deals } from "@/server/db/schema";
import { sendGmailAs } from "@/server/gmail/send";
import { getCompanyName, getCompanyLogoHtml } from "@/server/settings";
import { getUserEmailSignatureHtml } from "@/server/users";
import { emailShell, htmlBulletList, htmlButton, escapeHtml } from "@/lib/email-html";

// The borrower has to be quiet this long before a digest goes out, so a
// long working session (with gaps shorter than this) is one email...
const QUIET_MINUTES = 10;
// ...but a session that never pauses still gets reported at least this often.
const MAX_WAIT_MINUTES = 60;

const KIND_LABEL: Record<string, string> = {
  upload: "Uploaded",
  questionnaire: "Answered",
  application: "Application submitted",
  signed: "Signed",
};

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

/** Logs a completed task; the digest sweep below turns these into one email. */
export async function recordBorrowerActivity(
  dealId: string,
  needId: string,
  itemName: string,
  kind: "upload" | "questionnaire" | "application" | "signed"
) {
  await db.insert(borrowerActivityEvents).values({ dealId, needId, itemName, kind });
}

type Event = typeof borrowerActivityEvents.$inferSelect;

async function sendDigestForDeal(dealId: string, events: Event[]) {
  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    with: { assignedLoanOfficer: true, assignedProcessor: true },
  });
  const sender = deal?.assignedLoanOfficer;
  if (!deal || !sender?.email) return; // nothing to send as — events are still marked handled by the caller

  // One line per need (a need with several files/answers is still one item),
  // remembering how it came in.
  const byItem = new Map<string, string>();
  for (const e of events) byItem.set(e.itemName, e.kind);
  const items = [...byItem.entries()];
  const count = items.length;
  const borrowerList = htmlBulletList(items.map(([name]) => ({ name })));
  const staffList = htmlBulletList(items.map(([name, kind]) => ({ name, note: KIND_LABEL[kind] ?? "Completed" })));

  const [companyName, logoHtml, signatureHtml] = await Promise.all([
    getCompanyName(),
    getCompanyLogoHtml(),
    getUserEmailSignatureHtml(sender.id),
  ]);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  if (deal.borrowerEmail) {
    try {
      const html = emailShell({
        companyName,
        heading: "Received — thank you",
        bodyHtml: `<p style="margin:0 0 16px;">Hi ${escapeHtml(firstName(deal.borrowerName))},</p><p style="margin:0 0 16px;">Thanks for your work today. We received the following, and our team will review ${count === 1 ? "it" : "them"} shortly:</p>${borrowerList}<p style="margin:16px 0 0;">If anything else is needed, we'll let you know.</p>`,
      });
      await sendGmailAs(sender.id, sender.email, {
        to: deal.borrowerEmail,
        subject: `Received — ${deal.propertyAddress}`,
        body: logoHtml + html + signatureHtml,
        html: true,
      });
    } catch (err) {
      console.error("Failed to send borrower activity confirmation:", err);
    }
  }

  const staff = [...new Set([deal.assignedProcessor?.email, deal.assignedLoanOfficer?.email].filter((e): e is string => Boolean(e)))];
  try {
    const html = emailShell({
      companyName,
      heading: `${count} ${count === 1 ? "item" : "items"} ready for review`,
      bodyHtml: `<p style="margin:0 0 16px;">${escapeHtml(deal.borrowerName)} completed the following on ${escapeHtml(deal.propertyAddress)}:</p>${staffList}<p style="margin:16px 0 0;">${htmlButton("Review in Client Needs", `${appUrl}/deals/${deal.id}/loan-center`)}</p>`,
    });
    // One message to everyone working the file.
    await sendGmailAs(sender.id, sender.email, {
      to: staff.join(", "),
      subject: `Borrower activity — ${deal.borrowerName} (${deal.propertyAddress})`,
      body: logoHtml + html,
      html: true,
    });
  } catch (err) {
    console.error("Failed to send staff activity digest:", err);
  }
}

/**
 * Cron entry point: for each deal with un-notified activity, sends one
 * combined digest once the borrower has been quiet for QUIET_MINUTES (or the
 * oldest event has waited MAX_WAIT_MINUTES). Events are claimed by stamping
 * notifiedAt in one UPDATE before sending, so overlapping runs can't double
 * send; a failed send releases them for the next sweep.
 */
export async function sendBorrowerActivityDigests(now = new Date()): Promise<{ digests: number }> {
  const pending = await db.query.borrowerActivityEvents.findMany({
    where: isNull(borrowerActivityEvents.notifiedAt),
    orderBy: asc(borrowerActivityEvents.occurredAt),
  });

  const byDeal = new Map<string, Event[]>();
  for (const e of pending) byDeal.set(e.dealId, [...(byDeal.get(e.dealId) ?? []), e]);

  let digests = 0;
  for (const [dealId, events] of byDeal) {
    const newest = events[events.length - 1].occurredAt.getTime();
    const oldest = events[0].occurredAt.getTime();
    const quiet = now.getTime() - newest >= QUIET_MINUTES * 60_000;
    const overdue = now.getTime() - oldest >= MAX_WAIT_MINUTES * 60_000;
    if (!quiet && !overdue) continue;

    const ids = events.map((e) => e.id);
    const claimed = await db
      .update(borrowerActivityEvents)
      .set({ notifiedAt: now })
      .where(and(inArray(borrowerActivityEvents.id, ids), isNull(borrowerActivityEvents.notifiedAt)))
      .returning();
    if (claimed.length === 0) continue; // another run got there first

    try {
      await sendDigestForDeal(dealId, claimed);
      digests++;
    } catch (err) {
      console.error(`Borrower activity digest failed for deal ${dealId}:`, err);
      await db
        .update(borrowerActivityEvents)
        .set({ notifiedAt: null })
        .where(inArray(borrowerActivityEvents.id, claimed.map((c) => c.id)));
    }
  }
  return { digests };
}
