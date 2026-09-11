"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { dealClientNeeds, dealClientNeedDocuments } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { recomputeNeedStatus } from "@/server/client-need-status";

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
    const dataBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    await db.insert(dealClientNeedDocuments).values({
      clientNeedId: needId,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
      data: dataBase64,
      uploadedByUserId: user.id,
    });
  }

  // Uploading a document is itself a signal the need has been in play — mark
  // it sent if it wasn't already, so status derivation has a sentAt to work from.
  const need = await db.query.dealClientNeeds.findFirst({ where: eq(dealClientNeeds.id, needId) });
  if (need && !need.sentAt) {
    await db.update(dealClientNeeds).set({ sentAt: new Date() }).where(eq(dealClientNeeds.id, needId));
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
