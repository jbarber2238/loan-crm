// The only file in the connector that talks to the database. Two rules keep it
// safe:
//   1. Everything runs inside a READ ONLY transaction (withReadOnlyData), so
//      Postgres itself refuses any INSERT/UPDATE/DELETE even if code here were
//      ever wrong. mcp-read-only.test.ts checks the mode is always requested.
//   2. Columns are listed explicitly. Document contents (the `data` columns),
//      answers, custom-form payloads and anything holding SSNs, birth dates or
//      account numbers are never selected. The same test fails the build if
//      one of those identifiers shows up in this file.

import { and, desc, eq, gte, inArray, isNotNull, isNull, max, notInArray, notLike, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "@/server/db/client";
import {
  borrowerActivityEvents,
  dealClientNeedAnswers,
  dealClientNeedDocuments,
  dealClientNeeds,
  dealConditions,
  dealKeyDateEvents,
  dealNotes,
  dealStageHistory,
  deals,
  emailLogEntries,
  lenders,
  products,
  referralAffiliates,
  users,
} from "@/server/db/schema";
import { emailLabel, stageLabel } from "./operations";
import { safeText } from "./redact";
import type { ActivityRow, McpData, NeedRow } from "./model";

type ReadHandle = Parameters<Parameters<typeof db.transaction>[0]>[0];

const STATEMENT_TIMEOUT = "15s";

/** Runs `fn` against the CRM in a read-only transaction. Writes fail at the database. */
export function withReadOnlyData<T>(fn: (data: McpData) => Promise<T>): Promise<T> {
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`set local statement_timeout = ${sql.raw(`'${STATEMENT_TIMEOUT}'`)}`);
      return fn(createDbData(tx));
    },
    { accessMode: "read only" }
  );
}

// Automated nags and digests are not progress on a loan, so they don't count as "activity".
const AUTOMATED_EMAIL_CATEGORIES = ["client_needs_reminder_auto", "borrower_survey_reminder", "borrower_activity_digest", "staff_activity_digest"];
const REMINDER_CATEGORIES = ["client_needs_update", "client_needs_reminder_auto"];

const OUTSTANDING_STATUSES = ["not_sent", "awaiting_docs", "review_needed", "document_rejected_not_sent", "need_rejected_not_sent"] as const;

const dealColumns = {
  id: deals.id,
  loanNumber: deals.loanNumber,
  borrowerName: deals.borrowerName,
  propertyAddress: deals.propertyAddress,
  loanCategory: deals.loanCategory,
  stage: deals.stage,
  pausedFromStage: deals.pausedFromStage,
  lenderName: lenders.name,
  productName: products.name,
  loanOfficerId: deals.assignedLoanOfficerId,
  processorId: deals.assignedProcessorId,
  assistantId: deals.assignedAssistantId,
  loanAmountRequested: deals.loanAmountRequested,
  approvedLoanAmount: deals.approvedLoanAmount,
  estimatedClosingDate: deals.estimatedClosingDate,
  creditPullDate: deals.creditPullDate,
  rateLockedAt: deals.rateLockedAt,
  rateLockExpiresAt: deals.rateLockExpiresAt,
  clearToCloseDate: deals.clearToCloseDate,
  closedDate: deals.closedDate,
  referralPartnerName: referralAffiliates.name,
  referralPartnerType: referralAffiliates.partnerType,
  lostReason: deals.lostReason,
  createdAt: deals.createdAt,
};

function selectDeals(h: ReadHandle) {
  return h
    .select(dealColumns)
    .from(deals)
    .leftJoin(lenders, eq(lenders.id, deals.lenderId))
    .leftJoin(products, eq(products.id, deals.productId))
    .leftJoin(referralAffiliates, eq(referralAffiliates.id, deals.referredByAffiliateId));
}

const bump = (map: Map<string, Date>, id: string | null, at: Date | null) => {
  if (!id || !at) return;
  const seen = map.get(id);
  if (!seen || at > seen) map.set(id, at);
};

export function createDbData(h: ReadHandle): McpData {
  return {
    async listTeam() {
      return h.select({ id: users.id, name: users.name, email: users.email }).from(users);
    },

    async listDeals({ stages }) {
      const notGone = and(isNull(deals.deletedAt), isNull(deals.archivedAt));
      const where = stages ? and(notGone, inArray(deals.stage, stages as (typeof deals.stage.enumValues)[number][])) : notGone;
      return selectDeals(h).where(where);
    },

    async findDeal(ref) {
      const match = ref.id ? eq(deals.id, ref.id) : eq(deals.loanNumber, ref.loanNumber ?? -1);
      const [row] = await selectDeals(h).where(and(match, isNull(deals.deletedAt))).limit(1);
      return row ?? null;
    },

    async stageCounts() {
      const rows = await h
        .select({ stage: deals.stage, n: sql<number>`count(*)::int` })
        .from(deals)
        .where(and(isNull(deals.deletedAt), isNull(deals.archivedAt)))
        .groupBy(deals.stage);
      return Object.fromEntries(rows.map((r) => [r.stage, r.n]));
    },

    async lastActivity(dealIds) {
      const out = new Map<string, Date>();
      if (!dealIds.length) return out;
      const [history, notes, emails, borrower, docs, created, accepted, conditionsMade, conditionsCleared, keyDates] = await Promise.all([
        h.select({ id: dealStageHistory.dealId, at: max(dealStageHistory.changedAt) }).from(dealStageHistory).where(inArray(dealStageHistory.dealId, dealIds)).groupBy(dealStageHistory.dealId),
        h.select({ id: dealNotes.dealId, at: max(dealNotes.createdAt) }).from(dealNotes).where(inArray(dealNotes.dealId, dealIds)).groupBy(dealNotes.dealId),
        h
          .select({ id: emailLogEntries.dealId, at: max(emailLogEntries.sentAt) })
          .from(emailLogEntries)
          .where(and(inArray(emailLogEntries.dealId, dealIds), notInArray(emailLogEntries.category, AUTOMATED_EMAIL_CATEGORIES), notLike(emailLogEntries.category, "%\\_auto")))
          .groupBy(emailLogEntries.dealId),
        h.select({ id: borrowerActivityEvents.dealId, at: max(borrowerActivityEvents.occurredAt) }).from(borrowerActivityEvents).where(inArray(borrowerActivityEvents.dealId, dealIds)).groupBy(borrowerActivityEvents.dealId),
        h
          .select({ id: dealClientNeeds.dealId, at: max(dealClientNeedDocuments.createdAt) })
          .from(dealClientNeedDocuments)
          .innerJoin(dealClientNeeds, eq(dealClientNeeds.id, dealClientNeedDocuments.clientNeedId))
          .where(inArray(dealClientNeeds.dealId, dealIds))
          .groupBy(dealClientNeeds.dealId),
        h.select({ id: dealClientNeeds.dealId, at: max(dealClientNeeds.createdAt) }).from(dealClientNeeds).where(inArray(dealClientNeeds.dealId, dealIds)).groupBy(dealClientNeeds.dealId),
        h.select({ id: dealClientNeeds.dealId, at: max(dealClientNeeds.acceptedAt) }).from(dealClientNeeds).where(inArray(dealClientNeeds.dealId, dealIds)).groupBy(dealClientNeeds.dealId),
        h.select({ id: dealConditions.dealId, at: max(dealConditions.createdAt) }).from(dealConditions).where(inArray(dealConditions.dealId, dealIds)).groupBy(dealConditions.dealId),
        h.select({ id: dealConditions.dealId, at: max(dealConditions.clearedAt) }).from(dealConditions).where(inArray(dealConditions.dealId, dealIds)).groupBy(dealConditions.dealId),
        h.select({ id: dealKeyDateEvents.dealId, at: max(dealKeyDateEvents.createdAt) }).from(dealKeyDateEvents).where(inArray(dealKeyDateEvents.dealId, dealIds)).groupBy(dealKeyDateEvents.dealId),
      ]);
      for (const rows of [history, notes, emails, borrower, docs, created, accepted, conditionsMade, conditionsCleared, keyDates]) {
        for (const r of rows) bump(out, r.id, r.at);
      }
      return out;
    },

    async stageHistory(dealId) {
      return h
        .select({ stage: dealStageHistory.stage, changedAt: dealStageHistory.changedAt, changedByName: users.name })
        .from(dealStageHistory)
        .leftJoin(users, eq(users.id, dealStageHistory.changedByUserId))
        .where(eq(dealStageHistory.dealId, dealId));
    },

    async conditions(dealId) {
      return h
        .select({
          id: dealConditions.id,
          category: dealConditions.category,
          description: dealConditions.description,
          status: dealConditions.status,
          processorNote: dealConditions.processorNote,
          createdAt: dealConditions.createdAt,
          clearedAt: dealConditions.clearedAt,
        })
        .from(dealConditions)
        .where(eq(dealConditions.dealId, dealId));
    },

    async keyDateEvents(dealId) {
      return h
        .select({ item: dealKeyDateEvents.item, status: dealKeyDateEvents.status, eventDate: dealKeyDateEvents.eventDate })
        .from(dealKeyDateEvents)
        .where(eq(dealKeyDateEvents.dealId, dealId));
    },

    async needs({ dealIds, outstandingOnly }) {
      if (!dealIds.length) return [];
      const where = outstandingOnly
        ? and(inArray(dealClientNeeds.dealId, dealIds), inArray(dealClientNeeds.status, [...OUTSTANDING_STATUSES]), isNull(dealClientNeeds.onHoldAt))
        : inArray(dealClientNeeds.dealId, dealIds);
      const rows = await h
        .select({
          id: dealClientNeeds.id,
          dealId: dealClientNeeds.dealId,
          itemName: dealClientNeeds.itemName,
          description: dealClientNeeds.description,
          status: dealClientNeeds.status,
          needType: dealClientNeeds.needType,
          onHoldAt: dealClientNeeds.onHoldAt,
          createdAt: dealClientNeeds.createdAt,
          sentAt: dealClientNeeds.sentAt,
          acceptedAt: dealClientNeeds.acceptedAt,
          requestedByUserId: dealClientNeeds.requestedByUserId,
          sentByUserId: dealClientNeeds.sentByUserId,
          responsibleParty: dealClientNeeds.responsibleParty,
          blocks: dealClientNeeds.blocks,
          formSubmittedAt: dealClientNeeds.customFormSubmittedAt,
        })
        .from(dealClientNeeds)
        .where(where);
      if (!rows.length) return [];

      const needIds = rows.map((r) => r.id);
      const [emails, events, uploads, answers] = await Promise.all([
        h
          .select({ category: emailLogEntries.category, sentAt: emailLogEntries.sentAt, needIds: emailLogEntries.needIds })
          .from(emailLogEntries)
          .where(and(inArray(emailLogEntries.dealId, dealIds), inArray(emailLogEntries.category, REMINDER_CATEGORIES)))
          .orderBy(desc(emailLogEntries.sentAt)),
        h
          .select({ id: borrowerActivityEvents.needId, at: max(borrowerActivityEvents.occurredAt) })
          .from(borrowerActivityEvents)
          .where(and(inArray(borrowerActivityEvents.dealId, dealIds), isNotNull(borrowerActivityEvents.needId)))
          .groupBy(borrowerActivityEvents.needId),
        h
          .select({ id: dealClientNeedDocuments.clientNeedId, at: max(dealClientNeedDocuments.createdAt) })
          .from(dealClientNeedDocuments)
          .where(and(inArray(dealClientNeedDocuments.clientNeedId, needIds), isNull(dealClientNeedDocuments.uploadedByUserId)))
          .groupBy(dealClientNeedDocuments.clientNeedId),
        h
          .select({ id: dealClientNeedAnswers.clientNeedId, at: max(dealClientNeedAnswers.answeredAt) })
          .from(dealClientNeedAnswers)
          .where(inArray(dealClientNeedAnswers.clientNeedId, needIds))
          .groupBy(dealClientNeedAnswers.clientNeedId),
      ]);

      // Newest first, so the first email naming a need is its latest reminder.
      const reminder = new Map<string, { at: Date; kind: "automatic" | "manual" }>();
      for (const e of emails) {
        for (const id of e.needIds ?? []) {
          if (!reminder.has(id)) reminder.set(id, { at: e.sentAt, kind: e.category === "client_needs_reminder_auto" ? "automatic" : "manual" });
        }
      }
      const activity = new Map<string, Date>();
      for (const r of [...events, ...uploads, ...answers]) bump(activity, r.id, r.at);
      for (const r of rows) bump(activity, r.id, r.formSubmittedAt);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      return rows.map(({ formSubmittedAt: _formSubmittedAt, ...r }): NeedRow => ({
        ...r,
        lastReminderAt: reminder.get(r.id)?.at ?? null,
        lastReminderKind: reminder.get(r.id)?.kind ?? null,
        lastBorrowerActivityAt: activity.get(r.id) ?? null,
      }));
    },

    async needDocuments(dealId) {
      // File names and review state only: the `data` column is never selected.
      const rows = await h
        .select({
          needId: dealClientNeedDocuments.clientNeedId,
          fileName: dealClientNeedDocuments.fileName,
          reviewStatus: dealClientNeedDocuments.reviewStatus,
          uploadedAt: dealClientNeedDocuments.createdAt,
          uploaderName: users.name,
          uploadedByUserId: dealClientNeedDocuments.uploadedByUserId,
          rejectionNote: dealClientNeedDocuments.rejectionNote,
        })
        .from(dealClientNeedDocuments)
        .innerJoin(dealClientNeeds, eq(dealClientNeeds.id, dealClientNeedDocuments.clientNeedId))
        .leftJoin(users, eq(users.id, dealClientNeedDocuments.uploadedByUserId))
        .where(eq(dealClientNeeds.dealId, dealId));
      return rows.map(({ uploaderName, uploadedByUserId, ...r }) => ({
        ...r,
        uploadedBy: uploadedByUserId ? (uploaderName ?? "staff") : "borrower_or_system",
      }));
    },

    async recentActivity({ since, dealId, perSourceLimit }) {
      const only = (col: AnyPgColumn) => (dealId ? eq(col, dealId) : undefined);
      const rows: ActivityRow[] = [];

      const stages = await h
        .select({ id: dealStageHistory.id, dealId: dealStageHistory.dealId, stage: dealStageHistory.stage, at: dealStageHistory.changedAt, actor: users.name })
        .from(dealStageHistory)
        .leftJoin(users, eq(users.id, dealStageHistory.changedByUserId))
        .where(and(gte(dealStageHistory.changedAt, since), only(dealStageHistory.dealId)))
        .orderBy(desc(dealStageHistory.changedAt))
        .limit(perSourceLimit);
      for (const r of stages) rows.push({ type: "stage_change", occurredAt: r.at, dealId: r.dealId, sourceId: r.id, actor: r.actor ?? "system", summary: `Moved to ${stageLabel(r.stage)}` });

      const added = await h
        .select({ id: dealClientNeeds.id, dealId: dealClientNeeds.dealId, item: dealClientNeeds.itemName, at: dealClientNeeds.createdAt, actor: users.name })
        .from(dealClientNeeds)
        .leftJoin(users, eq(users.id, dealClientNeeds.requestedByUserId))
        .where(and(gte(dealClientNeeds.createdAt, since), only(dealClientNeeds.dealId)))
        .orderBy(desc(dealClientNeeds.createdAt))
        .limit(perSourceLimit);
      for (const r of added) rows.push({ type: "need_added", occurredAt: r.at, dealId: r.dealId, sourceId: r.id, actor: r.actor, summary: `Client need added: ${safeText(r.item, 160)}` });

      const cleared = await h
        .select({ id: dealClientNeeds.id, dealId: dealClientNeeds.dealId, item: dealClientNeeds.itemName, at: dealClientNeeds.acceptedAt, actor: users.name })
        .from(dealClientNeeds)
        .leftJoin(users, eq(users.id, dealClientNeeds.acceptedByUserId))
        .where(and(isNotNull(dealClientNeeds.acceptedAt), gte(dealClientNeeds.acceptedAt, since), only(dealClientNeeds.dealId)))
        .orderBy(desc(dealClientNeeds.acceptedAt))
        .limit(perSourceLimit);
      for (const r of cleared) if (r.at) rows.push({ type: "need_cleared", occurredAt: r.at, dealId: r.dealId, sourceId: `${r.id}:accepted`, actor: r.actor, summary: `Client need accepted: ${safeText(r.item, 160)}` });

      const uploads = await h
        .select({
          id: dealClientNeedDocuments.id,
          dealId: dealClientNeeds.dealId,
          item: dealClientNeeds.itemName,
          file: dealClientNeedDocuments.fileName,
          at: dealClientNeedDocuments.createdAt,
          uploadedBy: dealClientNeedDocuments.uploadedByUserId,
          actor: users.name,
        })
        .from(dealClientNeedDocuments)
        .innerJoin(dealClientNeeds, eq(dealClientNeeds.id, dealClientNeedDocuments.clientNeedId))
        .leftJoin(users, eq(users.id, dealClientNeedDocuments.uploadedByUserId))
        .where(and(gte(dealClientNeedDocuments.createdAt, since), only(dealClientNeeds.dealId)))
        .orderBy(desc(dealClientNeedDocuments.createdAt))
        .limit(perSourceLimit);
      for (const r of uploads) {
        rows.push({
          type: "upload",
          occurredAt: r.at,
          dealId: r.dealId,
          sourceId: r.id,
          actor: r.uploadedBy ? (r.actor ?? "staff") : "borrower",
          summary: `Uploaded "${safeText(r.file, 120)}" to "${safeText(r.item, 120)}"`,
        });
      }

      const submissions = await h
        .select({ id: borrowerActivityEvents.id, dealId: borrowerActivityEvents.dealId, item: borrowerActivityEvents.itemName, kind: borrowerActivityEvents.kind, at: borrowerActivityEvents.occurredAt })
        .from(borrowerActivityEvents)
        .where(and(gte(borrowerActivityEvents.occurredAt, since), sql`${borrowerActivityEvents.kind} <> 'upload'`, only(borrowerActivityEvents.dealId)))
        .orderBy(desc(borrowerActivityEvents.occurredAt))
        .limit(perSourceLimit);
      for (const r of submissions) rows.push({ type: "borrower_submission", occurredAt: r.at, dealId: r.dealId, sourceId: r.id, actor: "borrower", summary: `Borrower ${r.kind}: ${safeText(r.item, 160)}` });

      const notes = await h
        .select({ id: dealNotes.id, dealId: dealNotes.dealId, body: dealNotes.body, source: dealNotes.source, at: dealNotes.createdAt, actor: users.name })
        .from(dealNotes)
        .leftJoin(users, eq(users.id, dealNotes.authorUserId))
        .where(and(gte(dealNotes.createdAt, since), only(dealNotes.dealId)))
        .orderBy(desc(dealNotes.createdAt))
        .limit(perSourceLimit);
      for (const r of notes) rows.push({ type: "note", occurredAt: r.at, dealId: r.dealId, sourceId: r.id, actor: r.actor ?? r.source, summary: safeText(r.body, 280) ?? "(empty note)" });

      const emails = await h
        .select({ id: emailLogEntries.id, dealId: emailLogEntries.dealId, category: emailLogEntries.category, subject: emailLogEntries.subject, at: emailLogEntries.sentAt, actor: users.name })
        .from(emailLogEntries)
        .leftJoin(users, eq(users.id, emailLogEntries.sentByUserId))
        .where(and(isNotNull(emailLogEntries.dealId), gte(emailLogEntries.sentAt, since), only(emailLogEntries.dealId)))
        .orderBy(desc(emailLogEntries.sentAt))
        .limit(perSourceLimit);
      for (const r of emails) {
        if (!r.dealId) continue;
        rows.push({ type: "email", occurredAt: r.at, dealId: r.dealId, sourceId: r.id, actor: r.actor ?? "automatic", summary: `${emailLabel(r.category)}: ${safeText(r.subject, 160) ?? "(no subject)"}` });
      }
      return rows;
    },
  };
}
