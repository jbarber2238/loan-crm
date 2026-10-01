import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals, dealClientNeeds } from "@/server/db/schema";
import { sendGmailAs } from "@/server/gmail/send";
import { getCompanyName, getCompanyLogoHtml } from "@/server/settings";
import { getUserEmailSignatureHtml } from "@/server/users";
import { buildBorrowerEmail } from "@/server/borrower-templates";
import { formatStatusList } from "@/server/client-needs-email-format";
import { htmlButton } from "@/lib/email-html";
import { checkReminderDue, REMINDER_HOUR_ET, REMINDER_MINUTE_ET } from "@/lib/reminder-schedule";

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
// session, unlike every other caller of that action. In dry-run mode this
// never writes — it just reports the existing link, or that one would be
// created, so a preview has zero side effects.
async function borrowerUploadUrl(deal: typeof deals.$inferSelect, dryRun: boolean): Promise<string> {
  let token = deal.borrowerUploadToken;
  if (!token) {
    if (dryRun) return "(a new upload link would be created on first real send)";
    token = crypto.randomUUID();
    await db.update(deals).set({ borrowerUploadToken: token }).where(eq(deals.id, deal.id));
  }
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/borrower-upload/${token}`;
}

type CandidateNeed = Awaited<ReturnType<typeof reminderCandidates>>[number];
type DealWithRelations = NonNullable<Awaited<ReturnType<typeof loadDealWithRelations>>>;

export interface ReminderPreviewGroup {
  senderName: string;
  senderEmail: string;
  to: string;
  cc: string;
  subject: string;
  rejectedItems: string[];
  outstandingItems: string[];
}

export interface ReminderPreview {
  dealId: string;
  propertyAddress: string;
  due: boolean;
  reason: string;
  groups: ReminderPreviewGroup[];
}

// One reminder email for one group of needs, sent from `senderId`'s own
// Gmail — the person who originally sent that particular batch of needs
// (see sentByUserId), so the borrower keeps hearing from the same person
// throughout. In dry-run mode this builds the exact same subject/recipients
// and returns them instead of calling sendGmailAs — nothing is sent.
async function buildReminderGroup(
  dealWithRelations: DealWithRelations,
  senderId: string,
  group: CandidateNeed[],
  uploadUrl: string
): Promise<{ ok: true; sender: NonNullable<Awaited<ReturnType<typeof loadSender>>>; subject: string; body: string; cc: string; rejectedItems: string[]; outstandingItems: string[] } | { ok: false }> {
  const sender = await loadSender(senderId);
  if (!sender?.email) return { ok: false };

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
  const { subject, body } = await buildBorrowerEmail("borrower_client_needs_update", dealWithRelations, {
    assignedLoanOfficerName: dealWithRelations.assignedLoanOfficer?.name ?? "",
    companyName,
    senderName: sender.name ?? "",
    extra: {
      clientNeedsStatusList: formatStatusList(rejectedNeeds, outstandingNeeds),
      clientNeedsUploadUrl: uploadUrl,
      clientNeedsUploadButton: htmlButton("Complete your tasks here", uploadUrl),
    },
  });

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

  return {
    ok: true,
    sender,
    subject,
    body,
    cc,
    rejectedItems: rejectedNeeds.map((n) => n.itemName),
    outstandingItems: outstandingNeeds.map((n) => n.itemName),
  };
}

async function loadSender(userId: string) {
  return db.query.users.findFirst({ where: (u, { eq: eqU }) => eqU(u.id, userId) });
}

async function loadDealWithRelations(dealId: string) {
  return db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    with: { assignedLoanOfficer: true, assignedProcessor: true, followers: true },
  });
}

// Groups the current awaiting_docs needs by whoever originally sent them —
// a processor may have sent most of the list and the loan officer added one
// later, and each group gets its own email from its own sender. Anything
// sent before sentByUserId existed falls back to the deal's assigned
// processor (who most commonly handles this day to day), then the loan
// officer if there's no processor assigned.
function groupBySender(needs: CandidateNeed[], deal: DealWithRelations): Map<string, CandidateNeed[]> {
  const groups = new Map<string, CandidateNeed[]>();
  for (const n of needs) {
    const key = n.sentByUserId ?? deal.assignedProcessorId ?? deal.assignedLoanOfficerId;
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), n]);
  }
  return groups;
}

async function evaluateDeal(
  deal: typeof deals.$inferSelect,
  now: Date
): Promise<{ due: false; reason: string } | { due: true; dealWithRelations: DealWithRelations; groups: Map<string, CandidateNeed[]> }> {
  if (deal.clientNeedsRemindersPaused) return { due: false, reason: "Reminders are paused on this deal" };
  if (!deal.borrowerEmail) return { due: false, reason: "No borrower email on file" };

  const needs = await reminderCandidates(deal.id);
  if (needs.length === 0) return { due: false, reason: "Nothing currently outstanding (awaiting_docs)" };

  // Counts from the last reminder if there's been one, otherwise from
  // whenever the oldest of these was originally sent — so a deal that's
  // never been reminded doesn't wait a full extra interval past its
  // original send before the first nudge.
  const earliestSentAt = needs.reduce<Date | null>((min, n) => {
    if (!n.sentAt) return min;
    return !min || n.sentAt < min ? n.sentAt : min;
  }, null);
  const baseline = deal.clientNeedsLastReminderAt ?? earliestSentAt;
  if (!baseline) return { due: false, reason: "Outstanding items have no sentAt yet (shouldn't happen)" };

  // Day-count, not elapsed hours: fires at REMINDER_HOUR_ET on the Nth
  // Eastern calendar day after baseline, regardless of what time of day
  // baseline itself fell on. The stored value is still hours (24/48/72/168)
  // for backward compatibility with existing deal settings — just
  // reinterpreted here as a day count (see checkReminderDue).
  const check = checkReminderDue(baseline, now, deal.clientNeedsReminderIntervalHours);
  if (!check.due) {
    return {
      due: false,
      reason: `Not due for ~${check.daysUntilDue} more day(s) (next at ${REMINDER_HOUR_ET}:${String(REMINDER_MINUTE_ET).padStart(2, "0")} AM ET)`,
    };
  }

  const dealWithRelations = await loadDealWithRelations(deal.id);
  if (!dealWithRelations) return { due: false, reason: "Deal not found" };

  const groups = groupBySender(needs, dealWithRelations);
  if (groups.size === 0) return { due: false, reason: "No loan officer or processor assigned to send from" };

  return { due: true, dealWithRelations, groups };
}

/**
 * Builds exactly what would be sent for one deal — same grouping, subject,
 * recipients and item lists as a real send — without ever calling
 * sendGmailAs or writing to the database. Safe to run against production
 * data at any time.
 */
export async function previewClientNeedsReminder(dealId: string, now = new Date()): Promise<ReminderPreview> {
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) return { dealId, propertyAddress: "", due: false, reason: "Deal not found", groups: [] };

  const evaluation = await evaluateDeal(deal, now);
  if (!evaluation.due) {
    return { dealId, propertyAddress: deal.propertyAddress, due: false, reason: evaluation.reason, groups: [] };
  }

  const { dealWithRelations, groups } = evaluation;
  const uploadUrl = await borrowerUploadUrl(dealWithRelations, true);
  const previewGroups: ReminderPreviewGroup[] = [];
  for (const [senderId, group] of groups) {
    const built = await buildReminderGroup(dealWithRelations, senderId, group, uploadUrl);
    if (!built.ok) continue;
    previewGroups.push({
      senderName: built.sender.name ?? "Unknown",
      senderEmail: built.sender.email!,
      to: dealWithRelations.borrowerEmail!,
      cc: built.cc,
      subject: built.subject,
      rejectedItems: built.rejectedItems,
      outstandingItems: built.outstandingItems,
    });
  }
  return {
    dealId,
    propertyAddress: dealWithRelations.propertyAddress,
    due: previewGroups.length > 0,
    reason: previewGroups.length > 0 ? "Would send now" : "Nothing left to send after building groups",
    groups: previewGroups,
  };
}

async function sendReminderForDeal(deal: typeof deals.$inferSelect, now: Date): Promise<boolean> {
  const evaluation = await evaluateDeal(deal, now);
  if (!evaluation.due) return false;
  const { dealWithRelations, groups } = evaluation;

  const uploadUrl = await borrowerUploadUrl(dealWithRelations, false);
  let sentAny = false;
  for (const [senderId, group] of groups) {
    try {
      const built = await buildReminderGroup(dealWithRelations, senderId, group, uploadUrl);
      if (!built.ok) continue;
      const [logoHtml, signatureHtml] = await Promise.all([getCompanyLogoHtml(), getUserEmailSignatureHtml(built.sender.id)]);
      await sendGmailAs(built.sender.id, built.sender.email!, {
        to: dealWithRelations.borrowerEmail!,
        cc: built.cc || null,
        subject: built.subject,
        body: logoHtml + built.body + signatureHtml,
        html: true,
        dealId: deal.id,
        category: "client_needs_reminder_auto",
        needIds: group.map((n) => n.id),
      });
      sentAny = true;
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
