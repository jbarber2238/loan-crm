"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { lenderDocuments } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { extractLenderPrograms, type ExtractedCriteria } from "@/server/ai/extract-lender-criteria";
import { extractAndStoreCriteria, extractAndStoreLenderWideCriteria } from "@/server/actions/lender-documents";
import { findOrCreateProduct } from "@/server/actions/lenders";
import { LOAN_CATEGORIES, labelFor } from "@/lib/labels";
import { resolveStagedFiles } from "@/server/staged-uploads";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

export interface AiFiledDocument {
  fileName: string;
  filedUnder: string[];
}

/**
 * The primary way matrices/guidelines get uploaded now: no "applies to"
 * picker — one AI pass reads the whole file, finds every loan program in it
 * (one for a single matrix, several for a lender's complete package) and
 * extracts each program's underwriting criteria, all in the same call.
 * Each program is filed under its category's product (creating the
 * product if it doesn't exist yet) with its criteria already populated, so
 * AI Lender Match can use the cheap stored-data path immediately instead of
 * falling back to re-reading the raw document. Falls back to an unscoped
 * lender-wide document when no loan program can be found in it, rather
 * than guessing.
 */
export async function uploadLenderDocumentsWithAI(
  lenderId: string,
  formData: FormData
): Promise<AiFiledDocument[]> {
  const user = await requireAdmin();
  await resolveStagedFiles(formData);

  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    throw new Error("Choose at least one file to upload");
  }
  const tooLarge = files.find((f) => f.size > MAX_FILE_SIZE);
  if (tooLarge) {
    throw new Error(`${tooLarge.name} is too large (15MB max)`);
  }

  const results: AiFiledDocument[] = [];

  for (const file of files) {
    const dataBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const mimeType = file.type || "application/octet-stream";
    const draft = { fileName: file.name, mimeType, data: dataBase64 };

    let programs: ExtractedCriteria[] = [];
    let general: ExtractedCriteria | null = null;
    try {
      ({ programs, general } = await extractLenderPrograms(draft));
    } catch (err) {
      console.error("Lender document classification/extraction failed:", err);
    }

    if (programs.length === 0) {
      const [doc] = await db
        .insert(lenderDocuments)
        .values({
          lenderId,
          productId: null,
          fileName: file.name,
          mimeType,
          fileSize: file.size,
          data: dataBase64,
          uploadedBy: user.id,
        })
        .returning();
      // Couldn't find a loan program in this one, but it may still be a
      // real cross-program overlay (a foreign-national matrix, a general
      // guideline) — keep the lender-wide eligibility facts from the same
      // extraction pass rather than paying for another one.
      await extractAndStoreLenderWideCriteria(lenderId, doc, general);
      results.push({ fileName: file.name, filedUnder: ["General (couldn't find a loan program in it)"] });
      continue;
    }

    // A package can hold several programs (fix and flip, new construction,
    // bridge, long-term rental...). The file is stored once, under the first
    // program's product, and every program gets its own criteria pointing
    // back at it — no duplicate copy of a multi-megabyte PDF per product.
    const filedUnder: string[] = [];
    let doc: typeof lenderDocuments.$inferSelect | null = null;
    for (const program of programs) {
      const category = program.detectedCategory as (typeof LOAN_CATEGORIES)[number]["value"];
      const product = await findOrCreateProduct(lenderId, category);
      if (!doc) {
        [doc] = await db
          .insert(lenderDocuments)
          .values({
            lenderId,
            productId: product.id,
            fileName: file.name,
            mimeType,
            fileSize: file.size,
            data: dataBase64,
            uploadedBy: user.id,
          })
          .returning();
      }
      await extractAndStoreCriteria(product.id, doc, program);
      filedUnder.push(labelFor(LOAN_CATEGORIES, category));
      revalidatePath(`/products/${product.id}`);
    }
    results.push({ fileName: file.name, filedUnder });
  }

  revalidatePath(`/lenders/${lenderId}`);
  revalidatePath("/lenders");
  return results;
}
