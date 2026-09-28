"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { dealClientNeeds, dealClientNeedDocuments } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { recomputeNeedStatus } from "@/server/client-need-status";
import { convertHeicIfNeeded } from "@/server/heic";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

export async function attachDocumentToClientNeed(dealId: string, needId: string, formData: FormData) {
  const user = await requireUser();
  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) {
    throw new Error("Choose at least one file to upload");
  }
  const tooLarge = files.find((f) => f.size > MAX_FILE_SIZE);
  if (tooLarge) {
    throw new Error(`${tooLarge.name} is too large (15MB max)`);
  }

  for (const file of files) {
    const original = Buffer.from(await file.arrayBuffer()).toString("base64");
    const stored = await convertHeicIfNeeded({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      dataBase64: original,
    });
    await db.insert(dealClientNeedDocuments).values({
      clientNeedId: needId,
      fileName: stored.fileName,
      mimeType: stored.mimeType,
      fileSize: Buffer.byteLength(stored.dataBase64, "base64"),
      data: stored.dataBase64,
      uploadedByUserId: user.id,
    });
  }

  // Uploading a document is itself a signal the need has been in play — mark
  // it sent if it wasn't already, so status derivation has a sentAt to work from.
  const need = await db.query.dealClientNeeds.findFirst({ where: eq(dealClientNeeds.id, needId) });
  if (need && !need.sentAt) {
    await db.update(dealClientNeeds).set({ sentAt: new Date(), sentByUserId: user.id }).where(eq(dealClientNeeds.id, needId));
  }

  await recomputeNeedStatus(needId);
  revalidatePath(`/deals/${dealId}/loan-center`);
}

// One shared pair of ID-list actions covers every case: reviewing a single
// document (a list of one), a checked multi-select, or "Accept/Reject Need"
// acting on every document at once — the caller decides which ids to pass.
export async function approveClientNeedDocuments(dealId: string, needId: string, documentIds: string[]) {
  const user = await requireUser();
  if (!documentIds.length) return;
  await db
    .update(dealClientNeedDocuments)
    .set({ reviewStatus: "approved", reviewedAt: new Date(), reviewedByUserId: user.id, rejectionNote: null })
    .where(and(eq(dealClientNeedDocuments.clientNeedId, needId), inArray(dealClientNeedDocuments.id, documentIds)));
  await recomputeNeedStatus(needId);
  revalidatePath(`/deals/${dealId}/loan-center`);
}

/**
 * Undoes an accidental rejection — puts the document(s) back to "pending"
 * under whatever client need they already belong to, clearing the
 * rejection note, so they re-enter the normal review flow rather than
 * staying stuck as rejected. Used from the deal-wide Documents tab, where
 * a selection can span several different client needs at once, so this
 * looks up and recomputes each affected need itself rather than taking
 * one needId like approve/reject above do.
 */
export async function restoreRejectedDocuments(dealId: string, documentIds: string[]) {
  await requireUser();
  if (!documentIds.length) return;

  const docs = await db.query.dealClientNeedDocuments.findMany({
    where: inArray(dealClientNeedDocuments.id, documentIds),
    columns: { id: true, clientNeedId: true },
  });
  if (!docs.length) return;

  await db
    .update(dealClientNeedDocuments)
    .set({ reviewStatus: "pending", reviewedAt: null, reviewedByUserId: null, rejectionNote: null })
    .where(inArray(dealClientNeedDocuments.id, documentIds));

  const needIds = [...new Set(docs.map((d) => d.clientNeedId))];
  for (const needId of needIds) await recomputeNeedStatus(needId);

  revalidatePath(`/deals/${dealId}/loan-center`);
}

export async function rejectClientNeedDocuments(
  dealId: string,
  needId: string,
  documentIds: string[],
  note: string
) {
  const user = await requireUser();
  if (!documentIds.length) return;
  if (!note.trim()) {
    throw new Error("A note is required to reject a document");
  }

  await db
    .update(dealClientNeedDocuments)
    .set({ reviewStatus: "rejected", reviewedAt: new Date(), reviewedByUserId: user.id, rejectionNote: note.trim() })
    .where(and(eq(dealClientNeedDocuments.clientNeedId, needId), inArray(dealClientNeedDocuments.id, documentIds)));

  await recomputeNeedStatus(needId);
  revalidatePath(`/deals/${dealId}/loan-center`);
}

export async function renameClientNeedDocument(
  dealId: string,
  needId: string,
  documentId: string,
  fileName: string
) {
  await requireUser();
  const trimmed = fileName.trim();
  if (!trimmed) throw new Error("File name can't be empty");

  const doc = await db.query.dealClientNeedDocuments.findFirst({ where: eq(dealClientNeedDocuments.id, documentId) });
  if (!doc) throw new Error("Document not found");

  // Processors are renaming for a naming convention, not re-typing
  // extensions — keep the original one if they didn't include one.
  const hasExtension = /\.[a-zA-Z0-9]{1,8}$/.test(trimmed);
  const originalExt = doc.fileName.match(/\.[a-zA-Z0-9]{1,8}$/)?.[0];
  const finalName = hasExtension || !originalExt ? trimmed : `${trimmed}${originalExt}`;

  await db
    .update(dealClientNeedDocuments)
    .set({ fileName: finalName })
    .where(and(eq(dealClientNeedDocuments.id, documentId), eq(dealClientNeedDocuments.clientNeedId, needId)));
  revalidatePath(`/deals/${dealId}/loan-center`);
}

export async function deleteClientNeedDocument(dealId: string, needId: string, documentId: string) {
  await requireUser();
  await db.delete(dealClientNeedDocuments).where(eq(dealClientNeedDocuments.id, documentId));
  await recomputeNeedStatus(needId);
  revalidatePath(`/deals/${dealId}/loan-center`);
}

export interface DealDocumentRow {
  id: string;
  fileName: string;
  itemName: string;
  rejectionNote: string | null;
  createdAt: Date;
}

/** Every accepted/rejected document on a deal, for the Documents tab — grouped client-side by status. */
export async function getDealDocumentsForDocumentsTab(dealId: string): Promise<{
  accepted: DealDocumentRow[];
  rejected: DealDocumentRow[];
}> {
  await requireUser();
  const rows = await db.query.dealClientNeedDocuments.findMany({
    where: (d, { inArray, eq: eqD }) =>
      inArray(
        d.clientNeedId,
        db.select({ id: dealClientNeeds.id }).from(dealClientNeeds).where(eqD(dealClientNeeds.dealId, dealId))
      ),
    with: { clientNeed: { columns: { itemName: true } } },
    orderBy: (d, { desc }) => desc(d.createdAt),
  });

  const accepted: DealDocumentRow[] = [];
  const rejected: DealDocumentRow[] = [];
  for (const r of rows) {
    const row: DealDocumentRow = {
      id: r.id,
      fileName: r.fileName,
      itemName: r.clientNeed.itemName,
      rejectionNote: r.rejectionNote,
      createdAt: r.createdAt,
    };
    if (r.reviewStatus === "approved") accepted.push(row);
    else if (r.reviewStatus === "rejected") rejected.push(row);
  }
  return { accepted, rejected };
}
