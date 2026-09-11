"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { companySettings } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";

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

export async function updateDscrCalculatorLink(formData: FormData) {
  await requireAdmin();
  const link = formData.get("dscrCalculatorLink");
  const trimmed = typeof link === "string" ? link.trim() : "";

  await db
    .insert(companySettings)
    .values({ id: "default", name: "", dscrCalculatorLink: trimmed || null })
    .onConflictDoUpdate({
      target: companySettings.id,
      set: { dscrCalculatorLink: trimmed || null, updatedAt: new Date() },
    });

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
