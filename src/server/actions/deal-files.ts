"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { dealFiles } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { fail } from "@/lib/action-result";
import { DEAL_FILE_NOTE_MAX, isDealFileCategory, validateDealFileBatch } from "@/lib/deal-files";
import { resolveStagedFiles } from "@/server/staged-uploads";

function revalidateDeal(dealId: string) {
  revalidatePath(`/deals/${dealId}/loan-center`);
}

/**
 * Saves one or more files on a deal, all with the same optional note. Each file is its own entry, so revisions pile up
 * in order instead of replacing each other. The batch is all or nothing: if any file is rejected, none are saved.
 */
export async function uploadDealFile(dealId: string, category: string, formData: FormData) {
  const user = await requireUser();
  await resolveStagedFiles(formData);
  if (!isDealFileCategory(category)) return fail("Unknown document type.");
  const files = formData.getAll("file").filter((f): f is File => f instanceof File && (f.size > 0 || f.name !== ""));
  const note = String(formData.get("note") ?? "").trim();
  const problem = validateDealFileBatch(files, note);
  if (problem) return fail(problem);

  await db.transaction(async (tx) => {
    for (const file of files) {
      await tx.insert(dealFiles).values({
        dealId,
        category,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
        data: Buffer.from(await file.arrayBuffer()).toString("base64"),
        note: note || null,
        uploadedByUserId: user.id,
      });
    }
  });
  revalidateDeal(dealId);
  return { saved: files.length };
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
