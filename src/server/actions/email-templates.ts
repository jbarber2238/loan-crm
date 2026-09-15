"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db/client";
import { emailTemplates } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { STAGES } from "@/lib/labels";

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function nullableStr(formData: FormData, key: string) {
  const value = str(formData, key);
  return value.length ? value : null;
}

const STAGE_VALUES = new Set(STAGES.map((s) => s.value));

function triggerStageOf(formData: FormData) {
  const value = nullableStr(formData, "triggerStage");
  return value && STAGE_VALUES.has(value as (typeof STAGES)[number]["value"])
    ? (value as (typeof STAGES)[number]["value"])
    : null;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "template";
}

async function uniqueKey(name: string): Promise<string> {
  const base = slugify(name);
  let key = base;
  let suffix = 2;
  while (await db.query.emailTemplates.findFirst({ where: eq(emailTemplates.key, key) })) {
    key = `${base}_${suffix}`;
    suffix += 1;
  }
  return key;
}

const templateContentSchema = z.object({
  name: z.string().min(1, "Name is required"),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
});

export async function updateEmailTemplate(id: string, formData: FormData) {
  const user = await requireAdmin();
  const parsed = templateContentSchema.parse({
    name: str(formData, "name"),
    subject: str(formData, "subject"),
    body: str(formData, "body"),
  });

  const existing = await db.query.emailTemplates.findFirst({ where: eq(emailTemplates.id, id) });
  if (!existing) throw new Error("Template not found");

  await db
    .update(emailTemplates)
    .set({
      name: parsed.name,
      subject: parsed.subject,
      body: parsed.body,
      // triggerStage only applies to borrower_lifecycle templates — the
      // pricing_request ones fire from app code, not a stage transition.
      triggerStage: existing.category === "borrower_lifecycle" ? triggerStageOf(formData) : null,
      active: formData.get("active") === "on",
      updatedByUserId: user.id,
      updatedAt: new Date(),
    })
    .where(eq(emailTemplates.id, id));

  revalidatePath("/email-templates");
}

export async function createEmailTemplate(formData: FormData) {
  const user = await requireAdmin();
  const parsed = templateContentSchema.parse({
    name: str(formData, "name"),
    subject: str(formData, "subject"),
    body: str(formData, "body"),
  });

  const key = await uniqueKey(parsed.name);

  await db.insert(emailTemplates).values({
    key,
    name: parsed.name,
    category: "borrower_lifecycle",
    subject: parsed.subject,
    body: parsed.body,
    triggerStage: triggerStageOf(formData),
    active: true,
    updatedByUserId: user.id,
  });

  revalidatePath("/email-templates");
}

export async function deleteEmailTemplate(id: string) {
  await requireAdmin();
  const existing = await db.query.emailTemplates.findFirst({ where: eq(emailTemplates.id, id) });
  if (!existing) return;
  // Every non-borrower_lifecycle category is looked up by key from app
  // code — deleting one would break sending, so only borrower-defined
  // templates can be removed.
  if (existing.category !== "borrower_lifecycle") {
    throw new Error("Built-in templates can't be deleted — deactivate instead.");
  }

  await db.delete(emailTemplates).where(eq(emailTemplates.id, id));
  revalidatePath("/email-templates");
}
