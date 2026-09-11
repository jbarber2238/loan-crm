"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { lenderDocuments } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { classifyLenderDocument } from "@/server/ai/lender-document-classify";
import { findOrCreateProduct } from "@/server/actions/lenders";
import { LOAN_CATEGORIES, labelFor } from "@/lib/labels";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

export interface AiFiledDocument {
  fileName: string;
  filedUnder: string[];
}

/**
 * The primary way matrices/guidelines get uploaded now: no "applies to"
 * picker — AI reads the file, decides which product category(ies) it
 * belongs to, and files it there (creating the product if it doesn't exist
 * yet). Falls back to an unscoped lender-wide document when it can't
 * confidently tell, rather than guessing.
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

    const classification = await classifyLenderDocument({ fileName: file.name, mimeType, dataBase64 });
    const categories = classification.confidence === "high" ? classification.categories : [];

    if (categories.length === 0) {
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

    const filedUnder: string[] = [];
    for (const category of categories) {
      const product = await findOrCreateProduct(lenderId, category);
      await db.insert(lenderDocuments).values({
        lenderId,
        productId: product.id,
        fileName: file.name,
        mimeType,
        fileSize: file.size,
        data: dataBase64,
        uploadedBy: user.id,
      });
      filedUnder.push(labelFor(LOAN_CATEGORIES, category));
    }
    results.push({ fileName: file.name, filedUnder });
  }

  revalidatePath(`/lenders/${lenderId}`);
  revalidatePath("/lenders");
  return results;
}
