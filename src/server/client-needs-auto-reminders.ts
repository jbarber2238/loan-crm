import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals, dealClientNeeds } from "@/server/db/schema";
import { sendGmailAs } from "@/server/gmail/send";
import { getCompanyName, getCompanyLogoHtml } from "@/server/settings";
import { getUserEmailSignatureHtml } from "@/server/users";
import { buildBorrowerEmail } from "@/server/borrower-templates";
import { formatStatusList } from "@/server/actions/client-needs-email";
import { htmlButton } from "@/lib/email-html";

const HOUR_MS = 60 * 60 * 1000;

/**
 * The automated follow-up: only items the borrower was already sent and
 * hasn't finished — status "awaiting_docs" (set by recomputeNeedStatus once
 * sentAt is set and nothing is pending/accepted; a rejected document lands
 * back here too, with its rejection note). Never a fresh "not_sent" item,
 * never something already under review or accepted, and never one on hold.
 */
async function reminderCandidates(dealId: string) {
  return db.query.dealClientNeeds.findMany({
    where: and(
      eq(dealClientNeeds.dealId, dealId),
      eq(dealClientNeeds.status, "awaiting_docs"),
      isNull(dealClientNeeds.onHoldAt)
    ),
    with: { documents: true },
  });
}

// Same get-or-create logic as getOrCreateBorrowerUploadLink (src/server/actions/deals.ts),
// but without requireUser() — this runs from a cron sweep with no logged-in
// session, unlike every other caller of that action.
async function borrowerUploadUrl(deal: typeof deals.$inferSelect): Promise<string> {
  let token = deal.borrowerUploadToken;
  if (!token) {
    token = crypto.randomUUID();
    await db.update(deals).set({ borrowerUploadToken: token }).where(eq(deals.id, deal.id));
  }
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/borrower-upload/${token}`;
}

type CandidateNeed = Awaited<ReturnType<typeof reminderCandidates>>[number];

// One reminder email for one group of needs, sent from `senderId`'s own
// Gmail — the person who originally sent that particular batch of needs
// (see sentByUserId), so the borrower keeps hearing from the same person
// throughout, not always the loan officer.
async function sendReminderGroup(
  dealWithRelations: NonNullable<Awaited<ReturnType<typeof loadDealWithRelations>>>,
  senderId: string,
  group: CandidateNeed[],
  uploadUrl: string
): Promise<boolean> {
  const sender = await db.query.users.findFirst({ where: (u, { eq: eqU }) => eqU(u.id, senderId) });
  if (!sender?.email) return false;

  const rejectedRows = group.filter((n) => n.documents.some((d) => d.reviewStatus === "rejected"));
  const rejectedIds = new Set(rejectedRows.map((n) => n.id));
  const rejectedNeeds = rejectedRows.map((n) => ({
    itemName: n.itemName,
    documents: n.documents.filter((d) => d.reviewStatus === "rejected"),
  }));
  const outstandingNeeds = group
    .filter((n) => !rejectedIds.has(n.id))
    .map((n) => ({ itemName: n.itemName, description: n.description }));

  const companyName = await getCompanyName();
  const [{ subject, body }, logoHtml, signatureHtml] = await Promise.all([
    buildBorrowerEmail("borrower_client_needs_update", dealWithRelations, {
      assignedLoanOfficerName: dealWithRelations.assignedLoanOfficer?.name ?? "",
      companyName,
      senderName: sender.name ?? "",
      extra: {
        clientNeedsStatusList: formatStatusList(rejectedNeeds, outstandingNeeds),
        clientNeedsUploadUrl: uploadUrl,
        clientNeedsUploadButton: htmlButton("Complete your tasks here", uploadUrl),
      },
    }),
    getCompanyLogoHtml(),
    getUserEmailSignatureHtml(sender.id),
  ]);

  // Same default-CC rule as the manual send: the loan officer (unless
  // they're the one sending) plus deal followers.
  const seen = new Set<string>([dealWithRelations.borrowerEmail!.toLowerCase(), sender.email.toLowerCase()]);
  const cc = [dealWithRelations.assignedLoanOfficer?.email, ...dealWithRelations.followers.map((f) => f.email)]
    .filter((email): email is string => Boolean(email))
    .filter((email) => {
      if (seen.has(email.toLowerCase())) return false;
      seen.add(email.toLowerCase());
      return true;
    })
    .join(", ");

  await sendGmailAs(sender.id, sender.email, {
    to: dealWithRelations.borrowerEmail!,
    cc: cc || null,
    subject,
    body: logoHtml + body + signatureHtml,
    html: true,
  });
  return true;
}

async function loadDealWithRelations(dealId: string) {
  return db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    with: { assignedLoanOfficer: true, followers: true },
  });
}

async function sendReminderForDeal(deal: typeof deals.$inferSelect, now: Date): Promise<boolean> {
  if (deal.clientNeedsRemindersPaused || !deal.borrowerEmail) return false;

  const needs = await reminderCandidates(deal.id);
  if (needs.length === 0) return false;

  // Counts from the last reminder if there's been one, otherwise from
  // whenever the oldest of these was originally sent — so a deal that's
  // never been reminded doesn't wait a full extra interval past its
  // original send before the first nudge.
  const earliestSentAt = needs.reduce<Date | null>((min, n) => {
    if (!n.sentAt) return min;
    return !min || n.sentAt < min ? n.sentAt : min;
  }, null);
  const baseline = deal.clientNeedsLastReminderAt ?? earliestSentAt;
  if (!baseline) return false;
  const dueAt = baseline.getTime() + deal.clientNeedsReminderIntervalHours * HOUR_MS;
  if (now.getTime() < dueAt) return false;

  const dealWithRelations = await loadDealWithRelations(deal.id);
  if (!dealWithRelations) return false;

  // Group by whoever originally sent each need — a processor may have sent
  // most of the list and the loan officer added one later, and each group
  // gets its own email from its own sender. Anything sent before this
  // column existed (sentByUserId null) falls back to the loan officer.
  const groups = new Map<string, CandidateNeed[]>();
  for (const n of needs) {
    const key = n.sentByUserId ?? dealWithRelations.assignedLoanOfficerId;
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), n]);
  }
  if (groups.size === 0) return false;

  const uploadUrl = await borrowerUploadUrl(dealWithRelations);
  let sentAny = false;
  for (const [senderId, group] of groups) {
    try {
      if (await sendReminderGroup(dealWithRelations, senderId, group, uploadUrl)) sentAny = true;
    } catch (err) {
      console.error(`Client-needs reminder group failed for deal ${deal.id}, sender ${senderId}:`, err);
    }
  }
  if (sentAny) await db.update(deals).set({ clientNeedsLastReminderAt: now }).where(eq(deals.id, deal.id));
  return sentAny;
}

/** Cron entry point — checked hourly; each deal's own interval/pause setting decides whether it actually sends. */
export async function sendClientNeedsAutoReminders(now = new Date()): Promise<{ sent: number; checked: number }> {
  const candidates = await db.query.deals.findMany({
    where: and(eq(deals.clientNeedsRemindersPaused, false)),
  });

  let sent = 0;
  for (const deal of candidates) {
    try {
      if (await sendReminderForDeal(deal, now)) sent++;
    } catch (err) {
      console.error(`Client-needs reminder failed for deal ${deal.id}:`, err);
    }
  }
  return { sent, checked: candidates.length };
}
