import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { dealNotes, dealStageHistory, deals } from "@/server/db/schema";
import { notifyAffiliateOfStageChange } from "@/server/actions/referral-affiliates";
import { PIPELINE_STAGES, isPipelineStage, type PipelineStage } from "@/lib/deal-pipeline";
import { STAGES } from "@/lib/labels";

// Stage moves the app makes on its own, as a result of something the team did
// elsewhere (sent the application, completed the appraisal, ran Extract
// Conditions, entered a Clear to Close or Closed date). Always forward-only,
// and each leaves a system note so the "why" is on the deal.

function stageLabel(stage: string): string {
  return STAGES.find((s) => s.value === stage)?.label ?? stage;
}

async function logAutoMove(dealId: string, toStage: string, why: string) {
  await db.insert(dealNotes).values({
    dealId,
    authorUserId: null,
    source: "system",
    body: `Moved to ${stageLabel(toStage)} automatically — ${why}`,
  });
}

/** Moves the deal `from` → `to` only if it is sitting at exactly `from`. */
export async function autoAdvanceDeal(
  dealId: string,
  from: PipelineStage,
  to: PipelineStage,
  userId: string | null,
  why: string
): Promise<boolean> {
  const [updated] = await db
    .update(deals)
    .set({ stage: to, updatedAt: new Date() })
    .where(and(eq(deals.id, dealId), eq(deals.stage, from)))
    .returning({ id: deals.id });
  if (!updated) return false;

  await db.insert(dealStageHistory).values({ dealId, stage: to, changedByUserId: userId });
  await logAutoMove(dealId, to, why);

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath(`/deals/${dealId}`);
  return true;
}

/**
 * Moves the deal up to `to` from any earlier stage on the pipeline line. A deal
 * that is already at or past `to`, or paused/lost/disqualified, is left alone —
 * a date never drags a deal backward or revives it.
 */
export async function autoAdvanceDealForwardTo(
  dealId: string,
  to: PipelineStage,
  userId: string | null,
  why: string
): Promise<boolean> {
  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    columns: { stage: true, referredByAffiliateId: true },
  });
  if (!deal || !isPipelineStage(deal.stage)) return false;

  const targetIndex = PIPELINE_STAGES.findIndex((s) => s.value === to);
  const currentIndex = PIPELINE_STAGES.findIndex((s) => s.value === deal.stage);
  if (currentIndex >= targetIndex) return false;

  const earlier = PIPELINE_STAGES.slice(0, targetIndex).map((s) => s.value);
  const [updated] = await db
    .update(deals)
    .set({ stage: to, updatedAt: new Date() })
    .where(and(eq(deals.id, dealId), inArray(deals.stage, earlier)))
    .returning({ id: deals.id });
  if (!updated) return false;

  await db.insert(dealStageHistory).values({ dealId, stage: to, changedByUserId: userId });
  await logAutoMove(dealId, to, why);
  if (deal.referredByAffiliateId) {
    await notifyAffiliateOfStageChange(dealId, to).catch((err) => {
      console.error("Failed to send affiliate stage-change email:", err);
    });
  }

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath(`/deals/${dealId}`);
  return true;
}
