"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db/client";
import { lenderCriteria, lenderReps, lenderWideCriteria, lenders, products } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { LOAN_CATEGORIES, labelFor } from "@/lib/labels";

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function nullableStr(formData: FormData, key: string) {
  const value = str(formData, key);
  return value.length ? value : null;
}

function nullableInt(formData: FormData, key: string) {
  const value = str(formData, key);
  if (!value.length) return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function nullableNumericStr(formData: FormData, key: string) {
  const value = str(formData, key);
  if (!value.length) return null;
  return Number.isFinite(Number(value)) ? value : null;
}

function nullableStrArray(formData: FormData, key: string) {
  const value = str(formData, key);
  if (!value.length) return null;
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

// Tri-state select: "" (not stated) / "yes" / "no" — a plain checkbox can't
// represent "not addressed by the document" the way the AI extraction itself
// distinguishes null from false.
function nullableBool(formData: FormData, key: string) {
  const value = str(formData, key);
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

// --- Lenders ---------------------------------------------------------------

const lenderSchema = z.object({
  name: z.string().min(1, "Name is required"),
  notes: z.string().optional(),
});

export async function createLender(formData: FormData) {
  await requireAdmin();
  const parsed = lenderSchema.parse({
    name: str(formData, "name"),
    notes: nullableStr(formData, "notes") ?? undefined,
  });

  const [lender] = await db
    .insert(lenders)
    .values({ name: parsed.name, notes: parsed.notes ?? null })
    .returning({ id: lenders.id });

  revalidatePath("/lenders");
  redirect(`/lenders/${lender.id}`);
}

export async function updateLender(lenderId: string, formData: FormData) {
  await requireAdmin();
  const parsed = lenderSchema.parse({
    name: str(formData, "name"),
    notes: nullableStr(formData, "notes") ?? undefined,
  });

  await db
    .update(lenders)
    .set({ name: parsed.name, notes: parsed.notes ?? null })
    .where(eq(lenders.id, lenderId));

  revalidatePath(`/lenders/${lenderId}`);
  revalidatePath("/lenders");
}

// The page submits this from two separate forms (submission/pricing links,
// and — only when method is "email" — the intro template), so only touch a
// field if its form was the one actually submitted, same reasoning as
// updateMyProfile: otherwise saving one form would null out the other's.
export async function updateLenderSubmission(lenderId: string, formData: FormData) {
  await requireAdmin();
  const updates: Partial<typeof lenders.$inferInsert> = {};

  if (formData.has("quickPricerUrl")) updates.quickPricerUrl = nullableStr(formData, "quickPricerUrl");
  if (formData.has("applicationSubmissionMethod")) {
    const method = str(formData, "applicationSubmissionMethod");
    updates.applicationSubmissionMethod = method === "portal" || method === "email" ? method : null;
  }
  if (formData.has("brokerPortalUrl")) updates.brokerPortalUrl = nullableStr(formData, "brokerPortalUrl");
  if (formData.has("introEmailSubject")) updates.introEmailSubject = nullableStr(formData, "introEmailSubject");
  if (formData.has("introEmailBody")) updates.introEmailBody = nullableStr(formData, "introEmailBody");

  if (Object.keys(updates).length === 0) return;

  await db.update(lenders).set(updates).where(eq(lenders.id, lenderId));
  revalidatePath(`/lenders/${lenderId}`);
}

export async function deleteLender(lenderId: string) {
  await requireAdmin();
  try {
    await db.delete(lenders).where(eq(lenders.id, lenderId));
  } catch {
    throw new Error(
      "Can't delete this lender — it's referenced by one or more deals. Mark its products inactive instead."
    );
  }
  revalidatePath("/lenders");
  redirect("/lenders");
}

// --- Lender reps -------------------------------------------------------------

const repSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email required"),
  phone: z.string().optional(),
});

export async function addLenderRep(lenderId: string, formData: FormData) {
  await requireAdmin();
  const parsed = repSchema.parse({
    name: str(formData, "name"),
    email: str(formData, "email"),
    phone: nullableStr(formData, "phone") ?? undefined,
  });

  // Only one rep per lender — Justin only ever deals with one contact at a
  // given lender at a time. The UI only shows the "add" form when there's
  // no rep yet; this is just defense in depth against a stale form submit.
  const existing = await db.query.lenderReps.findFirst({ where: eq(lenderReps.lenderId, lenderId) });
  if (existing) {
    throw new Error("This lender already has a rep — edit or remove the existing one first.");
  }

  await db.insert(lenderReps).values({
    lenderId,
    name: parsed.name,
    email: parsed.email,
    phone: parsed.phone ?? null,
  });

  revalidatePath(`/lenders/${lenderId}`);
}

export async function updateLenderRep(
  lenderId: string,
  repId: string,
  formData: FormData
) {
  await requireAdmin();
  const parsed = repSchema.parse({
    name: str(formData, "name"),
    email: str(formData, "email"),
    phone: nullableStr(formData, "phone") ?? undefined,
  });

  await db
    .update(lenderReps)
    .set({ name: parsed.name, email: parsed.email, phone: parsed.phone ?? null })
    .where(eq(lenderReps.id, repId));

  revalidatePath(`/lenders/${lenderId}`);
}

export async function deleteLenderRep(lenderId: string, repId: string) {
  await requireAdmin();
  await db.delete(lenderReps).where(eq(lenderReps.id, repId));
  revalidatePath(`/lenders/${lenderId}`);
}

// --- Products ----------------------------------------------------------------

const productSchema = z.object({
  category: z.string().min(1),
  notes: z.string().optional(),
});

// Shared by manual "Add Product" and the AI matrix-upload flow, which
// auto-creates whatever product category a classified document belongs to.
export async function findOrCreateProduct(
  lenderId: string,
  category: (typeof products.category.enumValues)[number]
): Promise<{ id: string }> {
  const existing = await db.query.products.findFirst({
    where: and(eq(products.lenderId, lenderId), eq(products.category, category)),
  });
  if (existing) return { id: existing.id };

  const [product] = await db
    .insert(products)
    .values({ lenderId, category, name: labelFor(LOAN_CATEGORIES, category) })
    .returning({ id: products.id });
  await db.insert(lenderCriteria).values({ productId: product.id });

  return { id: product.id };
}

export async function createProduct(lenderId: string, formData: FormData) {
  await requireAdmin();
  const parsed = productSchema.parse({
    category: str(formData, "category"),
    notes: nullableStr(formData, "notes") ?? undefined,
  });
  const category = parsed.category as (typeof products.category.enumValues)[number];

  const { id: productId } = await findOrCreateProduct(lenderId, category);
  if (parsed.notes) {
    await db.update(products).set({ notes: parsed.notes }).where(eq(products.id, productId));
  }

  revalidatePath(`/lenders/${lenderId}`);
}

export async function updateProduct(productId: string, formData: FormData) {
  await requireAdmin();
  const parsed = productSchema.parse({
    category: str(formData, "category"),
    notes: nullableStr(formData, "notes") ?? undefined,
  });
  const category = parsed.category as (typeof products.category.enumValues)[number];

  const [updated] = await db
    .update(products)
    .set({
      category,
      name: labelFor(LOAN_CATEGORIES, category),
      notes: parsed.notes ?? null,
    })
    .where(eq(products.id, productId))
    .returning({ lenderId: products.lenderId });

  if (updated) revalidatePath(`/lenders/${updated.lenderId}`);
}

export async function toggleProductActive(productId: string, active: boolean) {
  await requireAdmin();
  const [updated] = await db
    .update(products)
    .set({ active })
    .where(eq(products.id, productId))
    .returning({ lenderId: products.lenderId });
  if (updated) revalidatePath(`/lenders/${updated.lenderId}`);
}

export async function deleteProduct(lenderId: string, productId: string) {
  await requireAdmin();
  try {
    await db.delete(products).where(eq(products.id, productId));
  } catch {
    throw new Error(
      "Can't delete this product — it's referenced by one or more deals. Mark it inactive instead."
    );
  }
  revalidatePath(`/lenders/${lenderId}`);
  redirect(`/lenders/${lenderId}`);
}

// --- Lender criteria -----------------------------------------------------------

async function revalidateProductsLender(productId: string) {
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { lenderId: true },
  });
  if (product) revalidatePath(`/lenders/${product.lenderId}`);
}

// "otherNotes" is Justin's own free-text add-on; everything else here is
// AI-extracted (see extract-lender-criteria.ts) and only meant to be
// corrected here, not typed up from scratch — he uploads the real document
// and lets extraction do the first pass.
export async function updateLenderCriteria(productId: string, formData: FormData) {
  await requireAdmin();

  const values = {
    otherNotes: nullableStr(formData, "otherNotes"),
    minFico: nullableInt(formData, "minFico"),
    minLoanAmount: nullableNumericStr(formData, "minLoanAmount"),
    maxLoanAmount: nullableNumericStr(formData, "maxLoanAmount"),
    statesAllowed: nullableStrArray(formData, "statesAllowed"),
    propertyTypesAllowed: nullableStrArray(formData, "propertyTypesAllowed"),
    minDscr: nullableNumericStr(formData, "minDscr"),
    maxLtv: nullableNumericStr(formData, "maxLtv"),
    maxLtc: nullableNumericStr(formData, "maxLtc"),
    maxLtarv: nullableNumericStr(formData, "maxLtarv"),
    minExperienceCount: nullableInt(formData, "minExperienceCount"),
    entityOnlyRequired: nullableBool(formData, "entityOnlyRequired"),
    gcLicenseRequired: nullableBool(formData, "gcLicenseRequired"),
    msaPopulationMinimum: nullableInt(formData, "msaPopulationMinimum"),
    foreignNationalEligible: nullableBool(formData, "foreignNationalEligible"),
    itinEligible: nullableBool(formData, "itinEligible"),
    ruralEligible: nullableBool(formData, "ruralEligible"),
    // A human correction is itself a review — clears the flag so it stops
    // showing as needing attention.
    needsReview: false,
  };

  const existing = await db.query.lenderCriteria.findFirst({
    where: eq(lenderCriteria.productId, productId),
  });

  if (existing) {
    await db
      .update(lenderCriteria)
      .set(values)
      .where(eq(lenderCriteria.productId, productId));
  } else {
    await db.insert(lenderCriteria).values({ productId, ...values });
  }

  await revalidateProductsLender(productId);
}

export async function updateLenderWideCriteria(lenderId: string, formData: FormData) {
  await requireAdmin();

  const values = {
    foreignNationalEligible: nullableBool(formData, "foreignNationalEligible"),
    itinEligible: nullableBool(formData, "itinEligible"),
    ruralEligible: nullableBool(formData, "ruralEligible"),
    otherNotes: nullableStr(formData, "otherNotes"),
    needsReview: false,
  };

  const existing = await db.query.lenderWideCriteria.findFirst({
    where: eq(lenderWideCriteria.lenderId, lenderId),
  });

  if (existing) {
    await db.update(lenderWideCriteria).set(values).where(eq(lenderWideCriteria.lenderId, lenderId));
  } else {
    await db.insert(lenderWideCriteria).values({ lenderId, ...values });
  }

  revalidatePath(`/lenders/${lenderId}`);
}

