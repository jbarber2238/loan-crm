"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { lenderCriteria, lenderCriteriaTiers, lenderDocuments, lenderWideCriteria } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { extractLenderCriteria, type ExtractedCriteria } from "@/server/ai/extract-lender-criteria";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB — plenty for rate sheets/matrices

// Best-effort, one-time structured-criteria extraction for a newly-uploaded
// product document — this is what lets future lender-match runs check a
// deal against stored numbers instead of re-reading the document every time.
// Runs after the document is already saved and never throws: a broker
// re-uploading a corrected matrix shouldn't lose the upload itself just
// because this pass hit a parsing hiccup — it just leaves the product
// flagged for review instead.
// `precomputed` lets a caller that already ran extraction for its own reasons
// (the bulk auto-detect upload runs it once to classify the document's loan
// category) pass that same result through instead of paying for a second,
// redundant AI call on the same document.
export async function extractAndStoreCriteria(
  productId: string,
  document: { id: string; fileName: string; mimeType: string; data: string },
  precomputed?: ExtractedCriteria | null
) {
  let extracted = precomputed;
  if (extracted === undefined) {
    try {
      extracted = await extractLenderCriteria(document);
    } catch (err) {
      extracted = null;
      console.error("Lender criteria extraction failed:", err);
    }
  }

  const values = {
    minFico: extracted?.minFico ?? null,
    minLoanAmount: extracted?.minLoanAmount?.toString() ?? null,
    maxLoanAmount: extracted?.maxLoanAmount?.toString() ?? null,
    statesAllowed: extracted?.statesAllowed ?? null,
    propertyTypesAllowed: extracted?.propertyTypesAllowed ?? null,
    minDscr: extracted?.minDscr?.toString() ?? null,
    maxLtv: extracted?.maxLtv?.toString() ?? null,
    maxLtc: extracted?.maxLtc?.toString() ?? null,
    maxLtarv: extracted?.maxLtarv?.toString() ?? null,
    minExperienceCount: extracted?.minExperienceCount ?? null,
    entityOnlyRequired: extracted?.entityOnlyRequired ?? null,
    gcLicenseRequired: extracted?.gcLicenseRequired ?? null,
    msaPopulationMinimum: extracted?.msaPopulationMinimum ?? null,
    foreignNationalEligible: extracted?.foreignNationalEligible ?? null,
    itinEligible: extracted?.itinEligible ?? null,
    ruralEligible: extracted?.ruralEligible ?? null,
    extractedAt: new Date(),
    extractedFromDocumentId: document.id,
    // Nothing usable came out of this pass (extraction failed outright, or
    // the model found no readable criteria at all) — flag it rather than
    // silently leaving stale or empty data looking authoritative.
    needsReview: !extracted || Object.values(extracted).every((v) => v === null || (Array.isArray(v) && v.length === 0)),
    extractionNotes: extracted?.extractionNotes ?? "Extraction failed to run.",
  };

  const existing = await db.query.lenderCriteria.findFirst({ where: eq(lenderCriteria.productId, productId) });

  let criteriaId: string;
  if (existing) {
    await db.update(lenderCriteria).set(values).where(eq(lenderCriteria.productId, productId));
    criteriaId = existing.id;
  } else {
    const [row] = await db.insert(lenderCriteria).values({ productId, ...values }).returning({ id: lenderCriteria.id });
    criteriaId = row.id;
  }

  // A fresh upload always replaces the prior tier grid rather than merging —
  // an updated matrix can restructure its tiers entirely (different bands),
  // so there's no sound way to reconcile old and new rows.
  await db.delete(lenderCriteriaTiers).where(eq(lenderCriteriaTiers.criteriaId, criteriaId));
  if (extracted?.tiers.length) {
    await db.insert(lenderCriteriaTiers).values(
      extracted.tiers.map((t) => ({
        criteriaId,
        ficoMin: t.ficoMin,
        ficoMax: t.ficoMax,
        experienceMin: t.experienceMin,
        maxLtc: t.maxLtc?.toString() ?? null,
        maxLtarv: t.maxLtarv?.toString() ?? null,
        maxLtv: t.maxLtv?.toString() ?? null,
        notes: t.notes,
      }))
    );
  }
}

// Same one-time extraction idea as extractAndStoreCriteria, but for a
// lender-wide document (a cross-program overlay like a foreign-national
// matrix, or a general guideline sheet) that isn't scoped to one product —
// stored per-lender in lenderWideCriteria instead of per-product, so a
// lender-match run can reference these plain facts instead of re-reading
// that document's images/text on every single run.
export async function extractAndStoreLenderWideCriteria(
  lenderId: string,
  document: { id: string; fileName: string; mimeType: string; data: string },
  precomputed?: ExtractedCriteria | null
) {
  let extracted = precomputed;
  if (extracted === undefined) {
    try {
      extracted = await extractLenderCriteria(document);
    } catch (err) {
      extracted = null;
      console.error("Lender-wide criteria extraction failed:", err);
    }
  }

  // Unlike product criteria, a lender-wide doc having nothing to say about
  // foreign national/ITIN/rural eligibility is normal (most rate matrices
  // simply don't address it) — that alone isn't grounds for review. But
  // extractLenderCriteria's own couldn't-read/couldn't-parse fallbacks are
  // real failures wearing the same "everything null" shape, so those two
  // exact sentinel notes (the only ones it ever emits for those cases) are
  // what actually mean "a human should look at this."
  const genuineFailure =
    extracted?.extractionNotes === "Couldn't extract any readable text or images from this document." ||
    extracted?.extractionNotes === "Extraction ran but the response couldn't be parsed — needs a manual look or a re-run.";

  const values = {
    foreignNationalEligible: extracted?.foreignNationalEligible ?? null,
    itinEligible: extracted?.itinEligible ?? null,
    ruralEligible: extracted?.ruralEligible ?? null,
    extractedAt: new Date(),
    extractedFromDocumentId: document.id,
    needsReview: !extracted || genuineFailure,
    extractionNotes: extracted?.extractionNotes ?? "Extraction failed to run.",
  };

  const existing = await db.query.lenderWideCriteria.findFirst({ where: eq(lenderWideCriteria.lenderId, lenderId) });
  if (existing) {
    await db.update(lenderWideCriteria).set(values).where(eq(lenderWideCriteria.lenderId, lenderId));
  } else {
    await db.insert(lenderWideCriteria).values({ lenderId, ...values });
  }
}

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

  const inserted = await db
    .insert(lenderDocuments)
    .values(
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
    )
    .returning();

  if (productId) {
    for (const doc of inserted) {
      await extractAndStoreCriteria(productId, doc);
    }
  } else if (lenderId) {
    // A lender-wide document (a cross-program overlay, not master/org-wide)
    // gets the same one-time extraction treatment, scoped per-lender instead
    // of per-product.
    for (const doc of inserted) {
      await extractAndStoreLenderWideCriteria(lenderId, doc);
    }
  }
  // A master document (lenderId and productId both null) stays on the
  // existing per-run document-reading path — it spans every lender, so
  // there's no single lender/product row to store extracted criteria on.
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

// Lets an admin re-run extraction against the product's current document
// without re-uploading it — useful after a prompt fix, or if the first pass
// got flagged needsReview. Re-extracts from whichever document is most
// recent for this product, same "latest upload wins" rule as everywhere else.
export async function reextractProductCriteria(lenderId: string, productId: string) {
  await requireAdmin();

  const doc = await db.query.lenderDocuments.findFirst({
    where: eq(lenderDocuments.productId, productId),
    orderBy: (d, { desc }) => desc(d.createdAt),
  });
  if (!doc) throw new Error("This product has no uploaded document to extract from.");

  await extractAndStoreCriteria(productId, doc);

  revalidatePath(`/lenders/${lenderId}`);
}

// Mirrors reextractProductCriteria, but for a lender's own most recent
// lender-wide document instead of a specific product's.
export async function reextractLenderWideCriteria(lenderId: string) {
  await requireAdmin();

  const doc = await db.query.lenderDocuments.findFirst({
    where: (d, { and, eq: eqOp, isNull }) => and(eqOp(d.lenderId, lenderId), isNull(d.productId)),
    orderBy: (d, { desc }) => desc(d.createdAt),
  });
  if (!doc) throw new Error("This lender has no lender-wide document to extract from.");

  await extractAndStoreLenderWideCriteria(lenderId, doc);

  revalidatePath(`/lenders/${lenderId}`);
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
