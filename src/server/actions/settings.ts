"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { companySettings } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { computeLogoIsLight } from "@/server/logo-analysis";

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
