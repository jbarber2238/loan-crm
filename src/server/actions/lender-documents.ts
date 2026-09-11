"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { lenderDocuments } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB — plenty for rate sheets/matrices

async function insertLenderDocuments({
  lenderId,
  productId,
  formData,
  userId,
}: {
  lenderId: string | null;
  productId: string | null;
  formData: FormData;
  userId: string;
}) {
  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    throw new Error("Choose at least one file to upload");
  }
  const tooLarge = files.find((f) => f.size > MAX_FILE_SIZE);
  if (tooLarge) {
    throw new Error(`${tooLarge.name} is too large (15MB max)`);
  }

  await db.insert(lenderDocuments).values(
    await Promise.all(
      files.map(async (file) => ({
        lenderId,
        productId,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        fileSize: file.size,
        data: Buffer.from(await file.arrayBuffer()).toString("base64"),
        uploadedBy: userId,
      }))
    )
  );
}

export async function uploadLenderDocument(lenderId: string, formData: FormData) {
  const user = await requireAdmin();
  const productId = formData.get("productId");

  await insertLenderDocuments({
    lenderId,
    productId: typeof productId === "string" && productId ? productId : null,
    formData,
    userId: user.id,
  });

  revalidatePath(`/lenders/${lenderId}`);
  revalidatePath("/lenders");
  if (typeof productId === "string" && productId) {
    revalidatePath(`/products/${productId}`);
  }
}

// Used from the "Lender Matrices" tab, where the lender is chosen from a
// dropdown in the form rather than fixed by the page you're already on.
export async function uploadLenderMatrixDocument(formData: FormData) {
  const user = await requireAdmin();
  const lenderId = formData.get("lenderId");
  if (typeof lenderId !== "string" || !lenderId) {
    throw new Error("Choose a lender");
  }

  await insertLenderDocuments({ lenderId, productId: null, formData, userId: user.id });

  revalidatePath(`/lenders/${lenderId}`);
  revalidatePath("/lenders");
}

export async function deleteLenderDocument(lenderId: string, documentId: string) {
  await requireAdmin();
  await db.delete(lenderDocuments).where(eq(lenderDocuments.id, documentId));
  revalidatePath(`/lenders/${lenderId}`);
  revalidatePath("/lenders");
}

// Master documents apply to every lender and product (e.g. the org-wide
// lender matrix spreadsheet) — lenderId and productId are both null.
export async function uploadMasterDocument(formData: FormData) {
  const user = await requireAdmin();
  await insertLenderDocuments({ lenderId: null, productId: null, formData, userId: user.id });
  revalidatePath("/lenders");
}

export async function deleteMasterDocument(documentId: string) {
  await requireAdmin();
  await db.delete(lenderDocuments).where(eq(lenderDocuments.id, documentId));
  revalidatePath("/lenders");
}
