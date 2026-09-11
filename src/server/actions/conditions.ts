"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { dealConditions } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { extractConditions } from "@/server/ai/condition-extraction";
import { addClientNeedToDeal } from "@/server/actions/client-needs";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

export async function extractConditionsFromEmail(dealId: string, formData: FormData) {
  await requireUser();
  const emailText = formData.get("emailText");
  const uploadedFile = formData.get("file");

  const trimmedText = typeof emailText === "string" ? emailText.trim() : "";
  const hasFile = uploadedFile instanceof File && uploadedFile.size > 0;

  if (!trimmedText && !hasFile) {
    throw new Error("Paste the lender's conditions email or upload a file first");
  }
  if (hasFile && (uploadedFile as File).size > MAX_FILE_SIZE) {
    throw new Error("That file is too large (15MB max)");
  }

  const file = hasFile
    ? {
        fileName: (uploadedFile as File).name,
        mimeType: (uploadedFile as File).type || "application/pdf",
        dataBase64: Buffer.from(await (uploadedFile as File).arrayBuffer()).toString("base64"),
      }
    : undefined;

  const extracted = await extractConditions({ emailText: trimmedText || undefined, file });
  if (!extracted.length) {
    throw new Error("Couldn't find any conditions there — try again with the full email or letter.");
  }

  await db.insert(dealConditions).values(
    extracted.map((c) => ({
      dealId,
      description: c.text,
      category: c.category,
      suggestedNeedName: c.suggestedNeedName,
      suggestedNeedDescription: c.suggestedNeedDescription,
    }))
  );

  revalidatePath(`/deals/${dealId}/loan-center`);
}

export async function toggleConditionCleared(dealId: string, conditionId: string, cleared: boolean) {
  const user = await requireUser();
  await db
    .update(dealConditions)
    .set(
      cleared
        ? { status: "cleared", clearedAt: new Date(), clearedByUserId: user.id }
        : { status: "open", clearedAt: null, clearedByUserId: null }
    )
    .where(eq(dealConditions.id, conditionId));
  revalidatePath(`/deals/${dealId}/loan-center`);
}

export async function deleteCondition(dealId: string, conditionId: string) {
  await requireUser();
  await db.delete(dealConditions).where(eq(dealConditions.id, conditionId));
  revalidatePath(`/deals/${dealId}/loan-center`);
}

// Reuses the existing client-need creation path (custom, one-off for this
// deal by default) so a condition promoted to a client need shows up exactly
// like any other manually-added one — then marks the condition resolved and
// linked, since ongoing collection tracking now lives on the Client Needs tab.
export async function createClientNeedFromCondition(dealId: string, conditionId: string, formData: FormData) {
  const user = await requireUser();

  const created = await addClientNeedToDeal(dealId, formData);

  await db
    .update(dealConditions)
    .set({
      status: "cleared",
      clearedAt: new Date(),
      clearedByUserId: user.id,
      linkedClientNeedId: created?.id ?? null,
    })
    .where(eq(dealConditions.id, conditionId));

  revalidatePath(`/deals/${dealId}/loan-center`);
}
