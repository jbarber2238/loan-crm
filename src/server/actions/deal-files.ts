"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { dealFiles } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { fail } from "@/lib/action-result";
import { DEAL_FILE_NOTE_MAX, isDealFileCategory, validateDealFileUpload } from "@/lib/deal-files";
import { resolveStagedFiles } from "@/server/staged-uploads";

function revalidateDeal(dealId: string) {
  revalidatePath(`/deals/${dealId}/loan-center`);
}

/** Saves one file on a deal with an optional note. Each upload is its own entry, so revisions pile up in order instead of replacing each other. */
export async function uploadDealFile(dealId: string, category: string, formData: FormData) {
  const user = await requireUser();
  await resolveStagedFiles(formData);
  if (!isDealFileCategory(category)) return fail("Unknown document type.");
  const file = formData.get("file");
  const note = String(formData.get("note") ?? "").trim();
  const problem = validateDealFileUpload(file instanceof File ? file : null, note);
  if (problem || !(file instanceof File)) return fail(problem ?? "Choose a file to upload.");

  await db.insert(dealFiles).values({
    dealId,
    category,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    fileSize: file.size,
    data: Buffer.from(await file.arrayBuffer()).toString("base64"),
    note: note || null,
    uploadedByUserId: user.id,
  });
  revalidateDeal(dealId);
}

export async function updateDealFileNote(dealId: string, fileId: string, rawNote: string) {
  await requireUser();
  const note = rawNote.trim();
  if (note.length > DEAL_FILE_NOTE_MAX) return fail(`Keep the note under ${DEAL_FILE_NOTE_MAX.toLocaleString("en-US")} characters.`);
  await db
    .update(dealFiles)
    .set({ note: note || null })
    .where(and(eq(dealFiles.id, fileId), eq(dealFiles.dealId, dealId)));
  revalidateDeal(dealId);
}

export async function deleteDealFile(dealId: string, fileId: string) {
  await requireUser();
  await db.delete(dealFiles).where(and(eq(dealFiles.id, fileId), eq(dealFiles.dealId, dealId)));
  revalidateDeal(dealId);
}
