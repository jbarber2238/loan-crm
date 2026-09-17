"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { lenderDocuments } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { extractLenderCriteria } from "@/server/ai/extract-lender-criteria";
import { extractAndStoreCriteria } from "@/server/actions/lender-documents";
import { findOrCreateProduct } from "@/server/actions/lenders";
import { LOAN_CATEGORIES, labelFor } from "@/lib/labels";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

export interface AiFiledDocument {
  fileName: string;
  filedUnder: string[];
}

/**
 * The primary way matrices/guidelines get uploaded now: no "applies to"
 * picker — one AI pass reads the file, decides which product category it
 * belongs to, and extracts its underwriting criteria, all in the same call.
 * The document gets filed under that category's product (creating the
 * product if it doesn't exist yet) with its criteria already populated, so
 * AI Lender Match can use the cheap stored-data path immediately instead of
 * falling back to re-reading the raw document. Falls back to an unscoped
 * lender-wide document (no extraction) when the category can't be
 * confidently determined, rather than guessing.
 */
export async function uploadLenderDocumentsWithAI(
  lenderId: string,
  formData: FormData
): Promise<AiFiledDocument[]> {
  const user = await requireAdmin();

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

    let extracted;
    try {
      extracted = await extractLenderCriteria(draft);
    } catch (err) {
      extracted = null;
      console.error("Lender document classification/extraction failed:", err);
    }
    const category = extracted?.detectedCategory as (typeof LOAN_CATEGORIES)[number]["value"] | null | undefined;

    if (!category) {
      await db.insert(lenderDocuments).values({
        lenderId,
        productId: null,
        fileName: file.name,
        mimeType,
        fileSize: file.size,
        data: dataBase64,
        uploadedBy: user.id,
      });
      results.push({ fileName: file.name, filedUnder: ["General (couldn't confidently categorize)"] });
      continue;
    }

    const product = await findOrCreateProduct(lenderId, category);
    const [doc] = await db
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

    // Reuse the extraction already run above for classification — no need
    // to pay for a second AI pass over the same document.
    await extractAndStoreCriteria(product.id, doc, extracted);

    results.push({ fileName: file.name, filedUnder: [labelFor(LOAN_CATEGORIES, category)] });
    revalidatePath(`/products/${product.id}`);
  }

  revalidatePath(`/lenders/${lenderId}`);
  revalidatePath("/lenders");
  return results;
}
