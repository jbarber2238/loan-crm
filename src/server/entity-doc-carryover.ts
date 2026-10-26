import { and, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { db } from "@/server/db/client";
import { dealClientNeedDocuments, dealClientNeeds, deals } from "@/server/db/schema";
import { recomputeNeedStatus } from "@/server/client-need-status";
import {
  ENTITY_DOC_KINDS,
  compareBorrowers,
  entityDocKindOf,
  type EntityDocKind,
  type EntityDocOffer,
} from "@/lib/entity-doc-carryover";

export interface CarryOverPlanItem {
  kind: EntityDocKind;
  /** The need on the new deal that receives the files. */
  targetNeedId: string;
  /** The approved documents on the earlier deal's matching need(s). */
  sourceDocumentIds: string[];
}

export interface CarryOverPlan {
  offer: EntityDocOffer;
  items: CarryOverPlanItem[];
}

/**
 * Works out whether to offer this deal the entity documents from an earlier deal: only once the processing
 * fee is paid, only until someone answers, only when an earlier deal is the same borrower and entity, and
 * only for documents that earlier deal has approved and this deal has an empty slot for.
 */
export async function planEntityDocCarryOver(
  dealId: string,
  { requirePaid = true }: { requirePaid?: boolean } = {}
): Promise<CarryOverPlan | null> {
  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    columns: {
      id: true,
      borrowerName: true,
      borrowerEmail: true,
      borrowerEntityName: true,
      stripeInvoiceStatus: true,
      entityDocsCarryoverStatus: true,
      deletedAt: true,
    },
  });
  if (!deal || deal.deletedAt || deal.entityDocsCarryoverStatus) return null;
  if ((requirePaid && deal.stripeInvoiceStatus !== "paid") || !deal.borrowerEntityName?.trim()) return null;

  // This deal's own empty slots for each kind of entity document.
  const myNeeds = await db.query.dealClientNeeds.findMany({
    where: eq(dealClientNeeds.dealId, dealId),
    columns: { id: true, itemName: true },
    with: { documents: { columns: { id: true } } },
  });
  const slots = new Map<EntityDocKind, string>();
  for (const n of myNeeds) {
    const kind = entityDocKindOf(n.itemName);
    if (kind && n.documents.length === 0 && !slots.has(kind)) slots.set(kind, n.id);
  }
  if (slots.size === 0) return null;

  const candidates = await db.query.deals.findMany({
    where: and(ne(deals.id, dealId), isNull(deals.deletedAt), isNotNull(deals.borrowerEntityName)),
    columns: { id: true, loanNumber: true, propertyAddress: true, borrowerName: true, borrowerEmail: true, borrowerEntityName: true, createdAt: true },
  });
  const matches = candidates
    .map((c) => ({ c, cmp: compareBorrowers(deal, c) }))
    .filter((m) => m.cmp.same)
    .sort((a, b) => Number(b.cmp.emailMatches) - Number(a.cmp.emailMatches) || b.c.createdAt.getTime() - a.c.createdAt.getTime());

  for (const { c, cmp } of matches) {
    const theirNeeds = await db.query.dealClientNeeds.findMany({
      where: eq(dealClientNeeds.dealId, c.id),
      columns: { itemName: true },
      with: { documents: { columns: { id: true, fileName: true, fileSize: true }, where: (d, { eq: e }) => e(d.reviewStatus, "approved") } },
    });
    // An earlier deal can have the same kind of document on two needs, or the same file twice: bring each file once.
    const byKind = new Map<EntityDocKind, string[]>();
    const seen = new Set<string>();
    for (const n of theirNeeds) {
      const kind = entityDocKindOf(n.itemName);
      if (!kind) continue;
      for (const d of n.documents) {
        const fingerprint = `${kind}|${d.fileName}|${d.fileSize}`;
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        byKind.set(kind, [...(byKind.get(kind) ?? []), d.id]);
      }
    }

    const items: CarryOverPlanItem[] = [];
    const shown: EntityDocOffer["items"] = [];
    for (const k of ENTITY_DOC_KINDS) {
      const target = slots.get(k.kind);
      const source = byKind.get(k.kind);
      if (!target || !source?.length) continue;
      items.push({ kind: k.kind, targetNeedId: target, sourceDocumentIds: source });
      shown.push({ kind: k.kind, label: k.label, fileCount: source.length, needsReview: k.needsReview });
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
 * Does the copying for the chosen kinds: puts each document on the new deal's matching need, approved
 * (or pending re-review for ones that go stale), then refreshes those needs' statuses. Returns how many
 * files came over.
 */
export async function performEntityDocCarryOver(plan: CarryOverPlan, kinds: EntityDocKind[], userId: string): Promise<{ copied: number; kinds: EntityDocKind[] }> {
  const chosen = plan.items.filter((i) => kinds.includes(i.kind));
  let copied = 0;
  for (const item of chosen) {
    const sources = await db.select().from(dealClientNeedDocuments).where(inArray(dealClientNeedDocuments.id, item.sourceDocumentIds));
    const needsReview = ENTITY_DOC_KINDS.find((k) => k.kind === item.kind)?.needsReview ?? false;
    for (const doc of sources) {
      await db.insert(dealClientNeedDocuments).values({
        clientNeedId: item.targetNeedId,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        fileSize: doc.fileSize,
        data: doc.data,
        uploadedByUserId: userId,
        reviewStatus: needsReview ? "pending" : "approved",
        reviewedAt: needsReview ? null : new Date(),
        reviewedByUserId: needsReview ? null : userId,
        aiExtractedFacts: doc.aiExtractedFacts,
      });
      copied += 1;
    }
    // A permanent document was already reviewed and accepted on the earlier deal, so its need is accepted here
    // too (otherwise the borrower would still be asked for it). One that goes stale stays open for re-review.
    if (!needsReview) {
      await db.update(dealClientNeeds).set({ acceptedAt: new Date(), acceptedByUserId: userId }).where(eq(dealClientNeeds.id, item.targetNeedId));
    }
    await recomputeNeedStatus(item.targetNeedId);
  }
  return { copied, kinds: chosen.map((c) => c.kind) };
}
