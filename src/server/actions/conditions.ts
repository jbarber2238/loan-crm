"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { dealClientNeeds, dealConditions } from "@/server/db/schema";
import { canMarkSentToLender } from "@/lib/condition-owner";
import { requireUser } from "@/server/auth/guards";
import { autoAdvanceDeal } from "@/server/auto-stage-moves";
import { extractConditions } from "@/server/ai/condition-extraction";
import { resolveStagedFiles } from "@/server/staged-uploads";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

export async function extractConditionsFromEmail(dealId: string, formData: FormData) {
  const user = await requireUser();
  await resolveStagedFiles(formData);
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

  // Conditions coming back means underwriting has issued its decision.
  await autoAdvanceDeal(dealId, "underwriting_review", "conditional_approval", user.id, "conditions were extracted from the lender's email.");

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

// A borrower condition is tied to the client need made from it, so the Conditions tab can show who it is waiting on
// (borrower, processor, lender) as that need moves. The condition stays open until it is marked sent to the lender.
export async function linkConditionToClientNeed(dealId: string, conditionId: string, needId: string) {
  await requireUser();
  const [condition, need] = await Promise.all([
    db.query.dealConditions.findFirst({ where: and(eq(dealConditions.id, conditionId), eq(dealConditions.dealId, dealId)), columns: { id: true, category: true } }),
    db.query.dealClientNeeds.findFirst({ where: and(eq(dealClientNeeds.id, needId), eq(dealClientNeeds.dealId, dealId)), columns: { id: true } }),
  ]);
  if (!condition || !need) throw new Error("Condition or client need not found on this deal");
  if (condition.category !== "borrower") throw new Error("Only borrower conditions are linked to client needs");
  await db.update(dealConditions).set({ linkedClientNeedId: need.id }).where(eq(dealConditions.id, condition.id));
  revalidatePath(`/deals/${dealId}/loan-center`);
}

/**
 * Marks borrower conditions as sent to the lender, which also checks them off. Several at once. Only conditions whose
 * client need the processor has accepted can be marked, so nothing goes to the lender that she hasn't approved.
 * Taking the mark back reopens the condition.
 */
export async function markConditionsSentToLender(dealId: string, conditionIds: string[], sent: boolean): Promise<{ updated: number }> {
  const user = await requireUser();
  if (!conditionIds.length) return { updated: 0 };
  const rows = await db.query.dealConditions.findMany({
    where: and(eq(dealConditions.dealId, dealId), inArray(dealConditions.id, conditionIds)),
    columns: { id: true, category: true, status: true, sentToLenderAt: true },
    with: { linkedClientNeed: { columns: { status: true, onHoldAt: true } } },
  });
  if (!rows.length) throw new Error("Those conditions weren't found on this deal");

  let targets = rows;
  if (sent) {
    const blocked = rows.filter((r) => !canMarkSentToLender({ category: r.category, status: r.status, sentToLenderAt: r.sentToLenderAt, linkedNeed: r.linkedClientNeed }));
    if (blocked.length) throw new Error("Only conditions whose client need has been accepted can be marked sent to the lender.");
  } else {
    // Only reopen what was actually sent; a condition cleared some other way is left alone.
    targets = rows.filter((r) => r.sentToLenderAt);
  }
  if (!targets.length) return { updated: 0 };

  await db
    .update(dealConditions)
    .set(
      sent
        ? { status: "cleared", clearedAt: new Date(), clearedByUserId: user.id, sentToLenderAt: new Date(), sentToLenderByUserId: user.id }
        : { status: "open", clearedAt: null, clearedByUserId: null, sentToLenderAt: null, sentToLenderByUserId: null }
    )
    .where(inArray(dealConditions.id, targets.map((r) => r.id)));
  revalidatePath(`/deals/${dealId}/loan-center`);
  return { updated: targets.length };
}
