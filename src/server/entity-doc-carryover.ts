import { and, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { dealCarryoverDismissals, dealClientNeedDocuments, dealClientNeeds, deals } from "@/server/db/schema";
import { recomputeNeedStatus } from "@/server/client-need-status";
import {
  ENTITY_DOC_KINDS,
  carryOverKey,
  compareBorrowers,
  entityDocKindOf,
  normalizeName,
  type EntityDocKind,
  type EntityDocOffer,
  type OfferItem,
} from "@/lib/entity-doc-carryover";

export interface CarryOverPlanItem {
  /** Matches the offer item's key: the kind for known documents, otherwise `need:<name>`. */
  key: string;
  /** The need on the new deal that receives the files; null means one is created when copying. */
  targetNeedId: string | null;
  /** What to call (and describe) the need that gets created when there's no target. */
  newNeed: { itemName: string; description: string | null; minFiles: number };
  /** The documents on the earlier deal's matching need(s). */
  sourceDocumentIds: string[];
  needsReview: boolean;
}

export interface CarryOverPlan {
  offer: EntityDocOffer;
  items: CarryOverPlanItem[];
}

/**
 * Works out whether to offer this deal the documents from an earlier deal: only once the processing fee is
 * paid, only until the documents are copied, and only when an earlier deal is the same borrower and entity.
 * The entity documents are offered when that deal approved them and this deal has an empty slot for them.
 * Every other document that deal collected is offered too, unchecked, for the processor to judge.
 *
 * Pass `viewerUserId` to leave out the offer for someone who already pressed "No thanks" on this deal.
 * Copying itself doesn't pass it: a dismissal only hides the pop-up for that person.
 */
export async function planEntityDocCarryOver(
  dealId: string,
  { requirePaid = true, viewerUserId }: { requirePaid?: boolean; viewerUserId?: string } = {}
): Promise<CarryOverPlan | null> {
  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    columns: {
      id: true,
      borrowerName: true,
      borrowerEmail: true,
      borrowerEntityName: true,
      lenderId: true,
      stripeInvoiceStatus: true,
      entityDocsCarryoverStatus: true,
      deletedAt: true,
    },
  });
  if (!deal || deal.deletedAt || deal.entityDocsCarryoverStatus) return null;
  if ((requirePaid && deal.stripeInvoiceStatus !== "paid") || !deal.borrowerEntityName?.trim()) return null;
  if (viewerUserId) {
    const dismissed = await db.query.dealCarryoverDismissals.findFirst({
      where: and(eq(dealCarryoverDismissals.dealId, dealId), eq(dealCarryoverDismissals.userId, viewerUserId)),
      columns: { dealId: true },
    });
    if (dismissed) return null;
  }

  // This deal's own empty slots for each kind of entity document.
  const myNeeds = await db.query.dealClientNeeds.findMany({
    where: eq(dealClientNeeds.dealId, dealId),
    columns: { id: true, itemName: true, needType: true },
    with: { documents: { columns: { id: true } } },
  });
  // Only plain document-upload needs can receive files (signed forms and questionnaires are deal-specific).
  const slots = new Map<EntityDocKind, string>();
  const needByName = new Map<string, string>();
  for (const n of myNeeds) {
    if (n.needType !== "document_upload") continue;
    const kind = entityDocKindOf(n.itemName);
    if (kind && n.documents.length === 0 && !slots.has(kind)) slots.set(kind, n.id);
    const name = normalizeName(n.itemName);
    if (name && !needByName.has(name)) needByName.set(name, n.id);
  }

  const candidates = await db.query.deals.findMany({
    where: and(ne(deals.id, dealId), isNull(deals.deletedAt), isNotNull(deals.borrowerEntityName)),
    columns: { id: true, loanNumber: true, propertyAddress: true, borrowerName: true, borrowerEmail: true, borrowerEntityName: true, lenderId: true, createdAt: true },
  });
  const matches = candidates
    .map((c) => ({ c, cmp: compareBorrowers(deal, c) }))
    .filter((m) => m.cmp.same)
    .sort((a, b) => Number(b.cmp.emailMatches) - Number(a.cmp.emailMatches) || b.c.createdAt.getTime() - a.c.createdAt.getTime());

  for (const { c, cmp } of matches) {
    const theirNeeds = await db.query.dealClientNeeds.findMany({
      where: eq(dealClientNeeds.dealId, c.id),
      columns: { itemName: true, description: true, needType: true, minFiles: true },
      with: {
        documents: {
          columns: { id: true, fileName: true, fileSize: true, reviewStatus: true },
          where: (d, { ne: n }) => n(d.reviewStatus, "rejected"),
        },
      },
    });
    // An earlier deal can have the same kind of document on two needs, or the same file twice: bring each file once.
    interface Bucket {
      itemName: string;
      description: string | null;
      minFiles: number;
      approvedIds: string[];
      allIds: string[];
    }
    const byKey = new Map<string, Bucket>();
    const seen = new Set<string>();
    for (const n of theirNeeds) {
      if (n.needType !== "document_upload" || n.documents.length === 0) continue;
      const key = carryOverKey(n.itemName);
      const bucket = byKey.get(key) ?? { itemName: n.itemName, description: n.description, minFiles: n.minFiles, approvedIds: [], allIds: [] };
      for (const d of n.documents) {
        const fingerprint = `${key}|${d.fileName}|${d.fileSize}`;
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        bucket.allIds.push(d.id);
        if (d.reviewStatus === "approved") bucket.approvedIds.push(d.id);
      }
      byKey.set(key, bucket);
    }

    const items: CarryOverPlanItem[] = [];
    const shown: OfferItem[] = [];
    // Lender-specific sheets (experience, budget) only fit between two deals with the same lender.
    const sameLender = Boolean(deal.lenderId && c.lenderId && deal.lenderId === c.lenderId);
    const used = new Set<string>();
    for (const k of ENTITY_DOC_KINDS) {
      const bucket = byKey.get(k.kind);
      if (!bucket) continue;
      if (k.group === "entity") {
        // Entity documents are only offered approved, into an empty slot on this deal.
        const target = slots.get(k.kind);
        if (!target || bucket.approvedIds.length === 0) continue;
        used.add(k.kind);
        items.push({ key: k.kind, targetNeedId: target, newNeed: { itemName: bucket.itemName, description: bucket.description, minFiles: bucket.minFiles }, sourceDocumentIds: bucket.approvedIds, needsReview: k.needsReview });
        shown.push({ key: k.kind, label: k.label, fileCount: bucket.approvedIds.length, needsReview: k.needsReview, group: k.group, note: k.note });
        continue;
      }
      used.add(k.kind);
      const target = slots.get(k.kind) ?? needByName.get(normalizeName(bucket.itemName)) ?? null;
      items.push({ key: k.kind, targetNeedId: target, newNeed: { itemName: bucket.itemName, description: bucket.description, minFiles: bucket.minFiles }, sourceDocumentIds: bucket.allIds, needsReview: true });
      const lenderNote = k.requiresSameLender && !sameLender ? " This deal is with a different lender, so check that it fits." : "";
      shown.push({ key: k.kind, label: k.label, fileCount: bucket.allIds.length, needsReview: true, group: "optional", note: `${k.note ?? ""}${lenderNote}`.trim() });
    }
    // Everything else that deal collected: shown for the processor to judge, nothing pre-selected.
    const others = [...byKey.entries()].filter(([key]) => !used.has(key)).sort((a, b) => a[1].itemName.localeCompare(b[1].itemName));
    for (const [key, bucket] of others) {
      items.push({
        key,
        targetNeedId: needByName.get(normalizeName(bucket.itemName)) ?? null,
        newNeed: { itemName: bucket.itemName, description: bucket.description, minFiles: bucket.minFiles },
        sourceDocumentIds: bucket.allIds,
        needsReview: true,
      });
      shown.push({ key, label: bucket.itemName, fileCount: bucket.allIds.length, needsReview: true, group: "optional", note: "Comes over for you to review." });
    }
    if (items.length === 0) continue;

    return {
      offer: {
        currentBorrowerEmail: deal.borrowerEmail,
        prior: { id: c.id, loanNumber: c.loanNumber, address: c.propertyAddress, borrowerName: c.borrowerName, borrowerEmail: c.borrowerEmail },
        emailMatches: cmp.emailMatches,
        items: shown,
      },
      items,
    };
  }
  return null;
}

/**
 * Does the copying for the chosen items: puts each document on the new deal's matching need (creating the need
 * when this deal doesn't have one), approved or pending re-review, then refreshes those needs' statuses.
 * Returns how many files came over.
 */
export async function performEntityDocCarryOver(plan: CarryOverPlan, keys: string[], userId: string, dealId: string): Promise<{ copied: number; keys: string[] }> {
  const chosen = plan.items.filter((i) => keys.includes(i.key));
  let copied = 0;
  let nextSort: number | null = null;
  for (const item of chosen) {
    let targetNeedId = item.targetNeedId;
    if (!targetNeedId) {
      if (nextSort === null) {
        const [{ maxSortOrder } = { maxSortOrder: 0 }] = await db
          .select({ maxSortOrder: sql<number>`coalesce(max(${dealClientNeeds.sortOrder}), 0)` })
          .from(dealClientNeeds)
          .where(eq(dealClientNeeds.dealId, dealId));
        nextSort = Number(maxSortOrder);
      }
      nextSort += 1;
      const [created] = await db
        .insert(dealClientNeeds)
        .values({ dealId, itemName: item.newNeed.itemName, description: item.newNeed.description, needType: "document_upload", minFiles: item.newNeed.minFiles, sortOrder: nextSort })
        .returning({ id: dealClientNeeds.id });
      targetNeedId = created.id;
    }
    const sources = await db.select().from(dealClientNeedDocuments).where(inArray(dealClientNeedDocuments.id, item.sourceDocumentIds));
    for (const doc of sources) {
      await db.insert(dealClientNeedDocuments).values({
        clientNeedId: targetNeedId,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        fileSize: doc.fileSize,
        data: doc.data,
        uploadedByUserId: userId,
        reviewStatus: item.needsReview ? "pending" : "approved",
        reviewedAt: item.needsReview ? null : new Date(),
        reviewedByUserId: item.needsReview ? null : userId,
        aiExtractedFacts: doc.aiExtractedFacts,
      });
      copied += 1;
    }
    // A permanent document was already reviewed and accepted on the earlier deal, so its need is accepted here
    // too (otherwise the borrower would still be asked for it). One that goes stale stays open for re-review.
    if (!item.needsReview) {
      await db.update(dealClientNeeds).set({ acceptedAt: new Date(), acceptedByUserId: userId }).where(eq(dealClientNeeds.id, targetNeedId));
    }
    await recomputeNeedStatus(targetNeedId);
  }
  return { copied, keys: chosen.map((c) => c.key) };
}
