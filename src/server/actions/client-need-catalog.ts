"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { clientNeedQuestions, clientNeeds, productClientNeeds, categoryClientNeeds, loanCategoryEnum, products } from "@/server/db/schema";
import { requireClientNeedsEditor, requireUser } from "@/server/auth/guards";

type LoanCategory = (typeof loanCategoryEnum.enumValues)[number];
const VALID_LOAN_CATEGORIES = new Set<string>(loanCategoryEnum.enumValues);

const MAX_TEMPLATE_FILE_SIZE = 15 * 1024 * 1024; // 15MB

type NeedType = "document_upload" | "esign" | "questionnaire" | "link" | "pandadoc_form";

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function nullableStr(formData: FormData, key: string) {
  const value = str(formData, key);
  return value.length ? value : null;
}

function needTypeFrom(formData: FormData): NeedType {
  const value = str(formData, "needType");
  return value === "esign" || value === "questionnaire" || value === "link" || value === "pandadoc_form"
    ? value
    : "document_upload";
}

function questionsFrom(formData: FormData): string[] {
  return formData
    .getAll("questionText")
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim());
}

async function templateFileFields(formData: FormData) {
  const file = formData.get("templateFile");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_TEMPLATE_FILE_SIZE) {
      throw new Error(`${file.name} is too large (15MB max)`);
    }
    return {
      templateFileName: file.name,
      templateFileMimeType: file.type || "application/octet-stream",
      templateFileData: Buffer.from(await file.arrayBuffer()).toString("base64"),
      templateFileSize: file.size,
    };
  }
  if (str(formData, "removeTemplateFile") === "on") {
    return { templateFileName: null, templateFileMimeType: null, templateFileData: null, templateFileSize: null };
  }
  return {};
}

async function insertQuestions(clientNeedId: string, questions: string[]) {
  if (!questions.length) return;
  await db.insert(clientNeedQuestions).values(
    questions.map((questionText, i) => ({ clientNeedId, questionText, sortOrder: i }))
  );
}

function loanCategoriesFrom(formData: FormData): LoanCategory[] {
  return formData
    .getAll("loanCategories")
    .filter((v): v is string => typeof v === "string" && VALID_LOAN_CATEGORIES.has(v)) as LoanCategory[];
}

// The second of the three generation layers (see schema.ts on clientNeeds.isGlobal
// for the full picture) — which loan categories this item applies to
// regardless of lender. Replaces the full set each save, same pattern as
// insertQuestions above.
async function syncCategoryLinks(clientNeedId: string, categories: LoanCategory[]) {
  await db.delete(categoryClientNeeds).where(eq(categoryClientNeeds.clientNeedId, clientNeedId));
  if (categories.length) {
    await db.insert(categoryClientNeeds).values(
      categories.map((category, i) => ({ clientNeedId, category, sortOrder: i }))
    );
  }
}

function productIdsFrom(formData: FormData): string[] {
  return formData.getAll("productIds").filter((v): v is string => typeof v === "string" && v.length > 0);
}

/** All products (id + "Lender — Product") for the "applies to a specific lender's product" picker. */
export async function getAllProductOptions() {
  await requireUser();
  const rows = await db.query.products.findMany({
    where: (p, { eq: eqP }) => eqP(p.active, true),
    with: { lender: true },
  });
  // Sorted by lender name (then loan type within a lender) rather than in
  // the query, since drizzle's relational orderBy can't sort by a joined
  // relation's column directly — cheap either way at this table size.
  rows.sort((a, b) => a.lender.name.localeCompare(b.lender.name) || a.name.localeCompare(b.name));
  return rows.map((p) => ({ id: p.id, label: `${p.lender.name} — ${p.name}` }));
}

/** Which products this catalog item is currently attached to, system-wide — fetched lazily when an edit dialog opens so a save from any page (a specific lender's or the shared catalog's) never silently drops attachments on lenders it can't see. */
export async function getClientNeedProductIds(clientNeedId: string): Promise<string[]> {
  await requireClientNeedsEditor();
  const links = await db.query.productClientNeeds.findMany({
    where: eq(productClientNeeds.clientNeedId, clientNeedId),
    columns: { productId: true },
  });
  return links.map((l) => l.productId);
}

// The third, narrowest generation layer — this specific lender's product.
// Full sync (not additive) so the picker's current list always matches
// reality after a save; sortOrder for a newly-added link is appended to the
// end of that product's own checklist, independent of any other need.
async function syncProductLinks(clientNeedId: string, desiredProductIds: string[]) {
  const existing = await db.query.productClientNeeds.findMany({
    where: eq(productClientNeeds.clientNeedId, clientNeedId),
  });
  const existingIds = new Set(existing.map((l) => l.productId));
  const desired = new Set(desiredProductIds);

  const toRemove = existing.filter((l) => !desired.has(l.productId));
  if (toRemove.length) {
    await db.delete(productClientNeeds).where(inArray(productClientNeeds.id, toRemove.map((l) => l.id)));
  }

  const toAdd = desiredProductIds.filter((id) => !existingIds.has(id));
  for (const productId of toAdd) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(productClientNeeds)
      .where(eq(productClientNeeds.productId, productId));
    await db.insert(productClientNeeds).values({ productId, clientNeedId, sortOrder: Number(count) });
  }

  const affectedProductIds = [...new Set([...toRemove.map((l) => l.productId), ...toAdd])];
  if (affectedProductIds.length) {
    const affectedProducts = await db.query.products.findMany({
      where: inArray(products.id, affectedProductIds),
      columns: { lenderId: true },
    });
    for (const p of affectedProducts) revalidatePath(`/lenders/${p.lenderId}`);
  }
}

/**
 * Creates a new catalog entry. Every creation flow — the catalog page, the
 * "Custom Need" tab on a product, or anywhere else a client need gets typed
 * in — defaults to custom and reads a single "isStandard" checkbox off the
 * form to decide whether to promote it. Any admin or processor can do this;
 * there's no separate "standard-only" creation path anymore. `attachToProductId`,
 * when given, also puts it on that product's checklist in one step.
 */
export async function createClientNeed(formData: FormData, { attachToProductId }: { attachToProductId?: string } = {}) {
  const user = await requireClientNeedsEditor();
  const itemName = str(formData, "itemName");
  if (!itemName) throw new Error("Item name is required");

  const isCustom = str(formData, "isStandard") !== "on";
  const isGlobal = str(formData, "isGlobal") === "on";
  const loanCategories = isGlobal ? [] : loanCategoriesFrom(formData);

  const needType = needTypeFrom(formData);
  const fileFields = needType === "document_upload" ? await templateFileFields(formData) : {};

  const [created] = await db
    .insert(clientNeeds)
    .values({
      itemName,
      description: nullableStr(formData, "description"),
      category: nullableStr(formData, "category"),
      needType,
      esignVendor: needType === "esign" ? nullableStr(formData, "esignVendor") : null,
      linkUrl: needType === "link" ? nullableStr(formData, "linkUrl") : null,
      pandadocTemplateUuid: needType === "pandadoc_form" ? nullableStr(formData, "pandadocTemplateUuid") : null,
      isCustom,
      isGlobal,
      createdByUserId: user.id,
      ...fileFields,
    })
    .returning();

  if (needType === "questionnaire") {
    await insertQuestions(created.id, questionsFrom(formData));
  }
  if (loanCategories.length) {
    await syncCategoryLinks(created.id, loanCategories);
  }

  const productIds = isGlobal
    ? []
    : [...new Set([...productIdsFrom(formData), ...(attachToProductId ? [attachToProductId] : [])])];
  if (productIds.length) {
    await syncProductLinks(created.id, productIds);
  }

  revalidatePath("/client-needs");

  return created;
}

export async function updateClientNeed(clientNeedId: string, formData: FormData) {
  await requireClientNeedsEditor();
  const existing = await db.query.clientNeeds.findFirst({ where: eq(clientNeeds.id, clientNeedId) });
  if (!existing) throw new Error("Client need not found");

  const itemName = str(formData, "itemName");
  if (!itemName) throw new Error("Item name is required");

  const needType = needTypeFrom(formData);
  const fileFields =
    needType === "document_upload"
      ? await templateFileFields(formData)
      : { templateFileName: null, templateFileMimeType: null, templateFileData: null, templateFileSize: null };
  const isGlobal = str(formData, "isGlobal") === "on";
  const loanCategories = isGlobal ? [] : loanCategoriesFrom(formData);

  await db
    .update(clientNeeds)
    .set({
      itemName,
      description: nullableStr(formData, "description"),
      category: nullableStr(formData, "category"),
      needType,
      esignVendor: needType === "esign" ? nullableStr(formData, "esignVendor") : null,
      linkUrl: needType === "link" ? nullableStr(formData, "linkUrl") : null,
      pandadocTemplateUuid: needType === "pandadoc_form" ? nullableStr(formData, "pandadocTemplateUuid") : null,
      // Lets a processor promote a custom need to standard once they see it
      // asked for across more than one lender — no admin gate on that switch.
      isCustom: str(formData, "isStandard") !== "on",
      isGlobal,
      updatedAt: new Date(),
      ...fileFields,
    })
    .where(eq(clientNeeds.id, clientNeedId));

  await db.delete(clientNeedQuestions).where(eq(clientNeedQuestions.clientNeedId, clientNeedId));
  if (needType === "questionnaire") {
    await insertQuestions(clientNeedId, questionsFrom(formData));
  }
  await syncCategoryLinks(clientNeedId, loanCategories);
  await syncProductLinks(clientNeedId, isGlobal ? [] : productIdsFrom(formData));

  revalidatePath("/client-needs");
}

export async function deleteClientNeed(clientNeedId: string) {
  await requireClientNeedsEditor();
  await db.delete(clientNeeds).where(eq(clientNeeds.id, clientNeedId));
  revalidatePath("/client-needs");
}

// --- Attaching catalog items to a product's checklist -----------------------

export async function attachClientNeedsToProduct(productId: string, formData: FormData) {
  await requireClientNeedsEditor();
  const ids = formData.getAll("clientNeedId").filter((v): v is string => typeof v === "string" && v.length > 0);
  if (!ids.length) return;

  const existingLinks = await db.query.productClientNeeds.findMany({
    where: eq(productClientNeeds.productId, productId),
  });
  const alreadyAttached = new Set(existingLinks.map((l) => l.clientNeedId));
  const toAttach = ids.filter((id) => !alreadyAttached.has(id));
  if (!toAttach.length) return;

  let nextSort = existingLinks.length;
  await db.insert(productClientNeeds).values(
    toAttach.map((clientNeedId) => ({ productId, clientNeedId, sortOrder: nextSort++ }))
  );

  await revalidateProductLender(productId);
}

export async function detachClientNeedFromProduct(productId: string, clientNeedId: string) {
  await requireClientNeedsEditor();
  await db
    .delete(productClientNeeds)
    .where(and(eq(productClientNeeds.productId, productId), eq(productClientNeeds.clientNeedId, clientNeedId)));
  await revalidateProductLender(productId);
}

// Adds every item from another product's checklist that isn't already on
// this one — additive, not a wholesale replace, since items are shared now.
export async function cloneClientNeedsToProduct(targetProductId: string, formData: FormData) {
  await requireClientNeedsEditor();
  const sourceProductId = str(formData, "sourceProductId");
  if (!sourceProductId) return;

  const [sourceLinks, targetLinks] = await Promise.all([
    db.query.productClientNeeds.findMany({ where: eq(productClientNeeds.productId, sourceProductId) }),
    db.query.productClientNeeds.findMany({ where: eq(productClientNeeds.productId, targetProductId) }),
  ]);

  const alreadyAttached = new Set(targetLinks.map((l) => l.clientNeedId));
  const toAdd = sourceLinks.filter((l) => !alreadyAttached.has(l.clientNeedId));
  if (!toAdd.length) return;

  let nextSort = targetLinks.length;
  await db.insert(productClientNeeds).values(
    toAdd.map((l) => ({ productId: targetProductId, clientNeedId: l.clientNeedId, sortOrder: nextSort++ }))
  );

  await revalidateProductLender(targetProductId);
}

async function revalidateProductLender(productId: string) {
  const product = await db.query.products.findFirst({
    where: (p, { eq }) => eq(p.id, productId),
    columns: { lenderId: true },
  });
  if (product) revalidatePath(`/lenders/${product.lenderId}`);
}
