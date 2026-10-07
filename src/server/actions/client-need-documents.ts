"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { dealClientNeeds, dealClientNeedDocuments } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { recomputeNeedStatus } from "@/server/client-need-status";
import { shouldRestoreOnMove } from "@/lib/client-need-status";
import { convertHeicIfNeeded } from "@/server/heic";
import { addSingleCatalogNeedToDeal, addClientNeedToDeal } from "@/server/actions/client-needs";

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

// One shared pair of ID-list actions covers reviewing a single document (a
// list of one) or a checked multi-select — the caller decides which ids to
// pass. Deliberately NEVER accepts the need itself, no matter how many (or
// which) documents get approved this way — only the separate, explicit
// acceptClientNeed below can do that. See the acceptedAt column comment in
// schema.ts for why.
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

// The ONLY action that can mark a need Accepted — a deliberate, need-level
// decision, never a side effect of approving documents. Approves any
// documents still sitting at "pending" (so nothing is left dangling in an
// accepted need) before setting acceptedAt.
export async function acceptClientNeed(dealId: string, needId: string) {
  const user = await requireUser();

  const pendingDocs = await db.query.dealClientNeedDocuments.findMany({
    where: and(eq(dealClientNeedDocuments.clientNeedId, needId), eq(dealClientNeedDocuments.reviewStatus, "pending")),
    columns: { id: true },
  });
  if (pendingDocs.length) {
    await db
      .update(dealClientNeedDocuments)
      .set({ reviewStatus: "approved", reviewedAt: new Date(), reviewedByUserId: user.id, rejectionNote: null })
      .where(inArray(dealClientNeedDocuments.id, pendingDocs.map((d) => d.id)));
  }

  await db
    .update(dealClientNeeds)
    .set({ acceptedAt: new Date(), acceptedByUserId: user.id })
    .where(and(eq(dealClientNeeds.id, needId), eq(dealClientNeeds.dealId, dealId)));

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

  // Restoring a rejected document also brings back its need if that need was
  // deleted/hidden — a document under review needs somewhere visible to live.
  const needIds = [...new Set(docs.map((d) => d.clientNeedId))];
  for (const needId of needIds) await recomputeNeedStatus(needId, { reviveUnused: true });

  revalidatePath(`/deals/${dealId}/loan-center`);
}

/**
 * Edits the reason shown for rejected documents on a need — the note the
 * borrower sees in reminders and on their upload page, and the Documents tab's
 * "Reason for Rejection". Only documents that are actually rejected can be
 * edited, and a reason can't be blank.
 */
export async function updateRejectionNotes(
  dealId: string,
  needId: string,
  notes: { documentId: string; note: string }[]
) {
  await requireUser();
  const need = await db.query.dealClientNeeds.findFirst({
    where: and(eq(dealClientNeeds.id, needId), eq(dealClientNeeds.dealId, dealId)),
    columns: { id: true },
  });
  if (!need) throw new Error("Client need not found");

  for (const { documentId, note } of notes) {
    const trimmed = note.trim();
    if (!trimmed) throw new Error("A rejection reason can't be blank");
    await db
      .update(dealClientNeedDocuments)
      .set({ rejectionNote: trimmed })
      .where(
        and(
          eq(dealClientNeedDocuments.id, documentId),
          eq(dealClientNeedDocuments.clientNeedId, needId),
          eq(dealClientNeedDocuments.reviewStatus, "rejected")
        )
      );
  }

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

  // Rejecting a document — whether one of several or every document via
  // "Reject Need" — undoes a prior "Accept Need" decision, so the need
  // doesn't keep reading as Accepted once something in it has been flagged.
  await db.update(dealClientNeeds).set({ acceptedAt: null, acceptedByUserId: null }).where(eq(dealClientNeeds.id, needId));

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
  clientNeedId: string;
  rejectionNote: string | null;
  createdAt: Date;
}

/** Every accepted/rejected/unused document on a deal, for the Documents tab — grouped client-side by status. */
export async function getDealDocumentsForDocumentsTab(dealId: string): Promise<{
  accepted: DealDocumentRow[];
  rejected: DealDocumentRow[];
  unused: DealDocumentRow[];
}> {
  await requireUser();
  const rows = await db.query.dealClientNeedDocuments.findMany({
    where: (d, { inArray, eq: eqD }) =>
      inArray(
        d.clientNeedId,
        db.select({ id: dealClientNeeds.id }).from(dealClientNeeds).where(eqD(dealClientNeeds.dealId, dealId))
      ),
    with: { clientNeed: { columns: { itemName: true, status: true } } },
    orderBy: (d, { desc }) => desc(d.createdAt),
  });

  const accepted: DealDocumentRow[] = [];
  const rejected: DealDocumentRow[] = [];
  const unused: DealDocumentRow[] = [];
  for (const r of rows) {
    const row: DealDocumentRow = {
      id: r.id,
      fileName: r.fileName,
      itemName: r.clientNeed.itemName,
      clientNeedId: r.clientNeedId,
      rejectionNote: r.rejectionNote,
      createdAt: r.createdAt,
    };
    // A rejected document is always listed as Rejected, with the need it came
    // in under — even if that need has since been deleted (kept hidden just as
    // the record of its rejected documents) or marked Unused. Every other
    // document on an Unused need goes to Unused, whatever its review status
    // (one might still be "pending": never reviewed, just no longer needed).
    if (r.reviewStatus === "rejected") rejected.push(row);
    else if (r.clientNeed.status === "unused") unused.push(row);
    else if (r.reviewStatus === "approved") accepted.push(row);
  }
  return { accepted, rejected, unused };
}

export type ChangeNeedDestination =
  | { type: "existing"; needId: string }
  | { type: "new_standard"; catalogNeedId: string }
  | { type: "custom"; itemName: string; description?: string };

/**
 * Moves one document to a different client need on the same deal — a pure
 * reassignment (UPDATE, never an insert), so the document can never end up
 * in two needs at once. The document's own review status/rejection note are
 * left untouched; this just corrects which need it's filed under. Both the
 * source and destination needs get their status recomputed afterward.
 */
export async function changeClientNeedDocument(
  dealId: string,
  documentId: string,
  destination: ChangeNeedDestination
) {
  await requireUser();
  const doc = await db.query.dealClientNeedDocuments.findFirst({
    where: eq(dealClientNeedDocuments.id, documentId),
    with: { clientNeed: { columns: { id: true, dealId: true } } },
  });
  if (!doc || doc.clientNeed.dealId !== dealId) throw new Error("Document not found on this deal");
  const sourceNeedId = doc.clientNeedId;

  let destinationNeedId: string;
  // null for a need created just now by this move — it can't be rejected.
  let destinationStatus: string | null = null;
  if (destination.type === "existing") {
    const dest = await db.query.dealClientNeeds.findFirst({
      where: and(eq(dealClientNeeds.id, destination.needId), eq(dealClientNeeds.dealId, dealId)),
    });
    if (!dest || dest.id === sourceNeedId) throw new Error("Pick a different, existing need on this deal");
    destinationNeedId = dest.id;
    destinationStatus = dest.status;
  } else if (destination.type === "new_standard") {
    const created = await addSingleCatalogNeedToDeal(dealId, destination.catalogNeedId);
    if (!created) throw new Error("Couldn't create that need");
    destinationNeedId = created.id;
  } else {
    if (!destination.itemName.trim()) throw new Error("Name the new need");
    const formData = new FormData();
    formData.set("itemName", destination.itemName.trim());
    if (destination.description) formData.set("description", destination.description);
    formData.set("needType", "document_upload");
    const created = await addClientNeedToDeal(dealId, formData);
    destinationNeedId = created.id;
  }

  // A rejected document moved into a need that isn't itself rejected is
  // restored for review as part of the move.
  const restored = shouldRestoreOnMove(doc.reviewStatus, destinationStatus);

  await db
    .update(dealClientNeedDocuments)
    .set(
      restored
        ? { clientNeedId: destinationNeedId, reviewStatus: "pending", reviewedAt: null, reviewedByUserId: null, rejectionNote: null }
        : { clientNeedId: destinationNeedId }
    )
    .where(eq(dealClientNeedDocuments.id, documentId));

  // The source keeps its Unused state if it has one (a document leaving an
  // Unused need must not quietly bring that need back).
  await recomputeNeedStatus(sourceNeedId);
  await recomputeNeedStatus(destinationNeedId);
  revalidatePath(`/deals/${dealId}/loan-center`);
  return { restored };
}
