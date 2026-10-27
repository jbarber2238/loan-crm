"use server";

import { eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { companySettings, resourceLinks } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { computeLogoIsLight } from "@/server/logo-analysis";
import { fail } from "@/lib/action-result";
import { MAX_RESOURCE_TITLE_LENGTH, normalizeResourceUrl } from "@/lib/resource-links";

export async function updateCompanyName(formData: FormData) {
  await requireAdmin();
  const name = formData.get("name");
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Company name is required");
  }

  await db
    .insert(companySettings)
    .values({ id: "default", name: name.trim() })
    .onConflictDoUpdate({
      target: companySettings.id,
      set: { name: name.trim(), updatedAt: new Date() },
    });

  revalidatePath("/", "layout");
}

const MAX_LOGO_SIZE = 2 * 1024 * 1024; // 2MB

export async function updateCompanyLogo(formData: FormData) {
  await requireAdmin();
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose an image to upload");
  if (file.size > MAX_LOGO_SIZE) throw new Error(`${file.name} is too large (2MB max)`);
  if (!file.type.startsWith("image/")) throw new Error("Logo must be an image file");

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const logoData = fileBuffer.toString("base64");
  const logoIsLight = await computeLogoIsLight(fileBuffer);

  await db
    .insert(companySettings)
    .values({
      id: "default",
      name: "",
      logoFileName: file.name,
      logoMimeType: file.type,
      logoData,
      logoIsLight,
    })
    .onConflictDoUpdate({
      target: companySettings.id,
      set: { logoFileName: file.name, logoMimeType: file.type, logoData, logoIsLight, updatedAt: new Date() },
    });

  revalidatePath("/settings/company");
}

export async function removeCompanyLogo() {
  await requireAdmin();
  await db
    .update(companySettings)
    .set({ logoFileName: null, logoMimeType: null, logoData: null, logoIsLight: false, updatedAt: new Date() })
    .where(eq(companySettings.id, "default"));
  revalidatePath("/settings/company");
}

// Blank fields are left untouched rather than cleared — this form always
// shows placeholders instead of the real saved values (see the integrations
// page), so a blank submit almost always means "didn't mean to change this,"
// not "clear it." Use the Disconnect button for that instead.
export async function updatePandaDocSettings(formData: FormData) {
  await requireAdmin();
  const apiKey = formData.get("apiKey");
  const webhookSharedKey = formData.get("webhookSharedKey");

  const updates: Record<string, string> = {};
  if (typeof apiKey === "string" && apiKey.trim()) updates.pandadocApiKey = apiKey.trim();
  if (typeof webhookSharedKey === "string" && webhookSharedKey.trim()) {
    updates.pandadocWebhookSharedKey = webhookSharedKey.trim();
  }
  if (!Object.keys(updates).length) return;

  await db
    .insert(companySettings)
    .values({ id: "default", name: "", ...updates })
    .onConflictDoUpdate({
      target: companySettings.id,
      set: { ...updates, updatedAt: new Date() },
    });

  revalidatePath("/settings/integrations");
}

export async function disconnectPandaDoc() {
  await requireAdmin();
  await db
    .update(companySettings)
    .set({ pandadocApiKey: null, pandadocWebhookSharedKey: null, updatedAt: new Date() })
    .where(eq(companySettings.id, "default"));
  revalidatePath("/settings/integrations");
}

export async function updateStripeSettings(formData: FormData) {
  await requireAdmin();
  const secretKey = formData.get("secretKey");
  const webhookSecret = formData.get("webhookSecret");

  const updates: Record<string, string> = {};
  if (typeof secretKey === "string" && secretKey.trim()) updates.stripeSecretKey = secretKey.trim();
  if (typeof webhookSecret === "string" && webhookSecret.trim()) updates.stripeWebhookSecret = webhookSecret.trim();
  if (!Object.keys(updates).length) return;

  await db
    .insert(companySettings)
    .values({ id: "default", name: "", ...updates })
    .onConflictDoUpdate({
      target: companySettings.id,
      set: { ...updates, updatedAt: new Date() },
    });

  revalidatePath("/settings/integrations");
}

export async function disconnectStripe() {
  await requireAdmin();
  await db
    .update(companySettings)
    .set({ stripeSecretKey: null, stripeWebhookSecret: null, updatedAt: new Date() })
    .where(eq(companySettings.id, "default"));
  revalidatePath("/settings/integrations");
}

const MAX_WIRE_FILE_SIZE = 15 * 1024 * 1024; // 15MB

/** Saves (or replaces) the company wire instructions every staff member can open. */
export async function updateCompanyWireInstructions(formData: FormData) {
  await requireAdmin();
  const file = formData.get("wire");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a file to upload.");
  if (file.size > MAX_WIRE_FILE_SIZE) return fail("That file is over 15MB. Please upload a smaller one.");

  const values = {
    wireInstructionsFileName: file.name,
    wireInstructionsMimeType: file.type || "application/octet-stream",
    wireInstructionsData: Buffer.from(await file.arrayBuffer()).toString("base64"),
    wireInstructionsUpdatedAt: new Date(),
  };
  await db
    .insert(companySettings)
    .values({ id: "default", name: process.env.COMPANY_NAME ?? "Manna Lending", ...values })
    .onConflictDoUpdate({ target: companySettings.id, set: { ...values, updatedAt: new Date() } });
  revalidatePath("/settings/company");
  revalidatePath("/settings");
}

export async function removeCompanyWireInstructions() {
  await requireAdmin();
  await db
    .update(companySettings)
    .set({ wireInstructionsFileName: null, wireInstructionsMimeType: null, wireInstructionsData: null, wireInstructionsUpdatedAt: null, updatedAt: new Date() })
    .where(eq(companySettings.id, "default"));
  revalidatePath("/settings/company");
  revalidatePath("/settings");
}

function readResourceFields(formData: FormData): { title: string; url: string } | { error: string } {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return fail("Give the link a name.");
  if (title.length > MAX_RESOURCE_TITLE_LENGTH) return fail(`Keep the name under ${MAX_RESOURCE_TITLE_LENGTH} characters.`);
  const url = normalizeResourceUrl(String(formData.get("url") ?? ""));
  if (!url) return fail("That doesn't look like a web link. Paste the full link, like https://docs.google.com/...");
  return { title, url };
}

function revalidateResources() {
  revalidatePath("/settings/company");
  revalidatePath("/settings");
}

/** Adds a pinned link to the end of the "Additional resources" list. */
export async function addResourceLink(formData: FormData) {
  await requireAdmin();
  const fields = readResourceFields(formData);
  if ("error" in fields) return fields;
  const [{ top }] = await db.select({ top: max(resourceLinks.sortOrder) }).from(resourceLinks);
  await db.insert(resourceLinks).values({ ...fields, sortOrder: (top ?? -1) + 1 });
  revalidateResources();
}

export async function updateResourceLink(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const fields = readResourceFields(formData);
  if ("error" in fields) return fields;
  await db.update(resourceLinks).set(fields).where(eq(resourceLinks.id, id));
  revalidateResources();
}

export async function deleteResourceLink(formData: FormData) {
  await requireAdmin();
  await db.delete(resourceLinks).where(eq(resourceLinks.id, String(formData.get("id") ?? "")));
  revalidateResources();
}

/** Swaps a link with its neighbour so the admin can arrange the list. */
export async function moveResourceLink(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const direction = formData.get("direction") === "up" ? -1 : 1;
  const rows = await db.query.resourceLinks.findMany({ orderBy: (r, { asc }) => [asc(r.sortOrder), asc(r.createdAt)] });
  const from = rows.findIndex((r) => r.id === id);
  const to = from + direction;
  if (from === -1 || to < 0 || to >= rows.length) return;
  const reordered = [...rows];
  [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
  // Renumber the whole list so ties from older rows can't make a swap a no-op.
  await Promise.all(reordered.map((r, i) => db.update(resourceLinks).set({ sortOrder: i }).where(eq(resourceLinks.id, r.id))));
  revalidateResources();
}
