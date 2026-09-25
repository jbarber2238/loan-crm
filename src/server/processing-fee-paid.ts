import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals } from "@/server/db/schema";
import { advanceDealStage } from "@/server/actions/deals";
import { notifyBorrowerOfAcceptedTerms, notifyProcessorOfPaidDeal } from "@/server/deal-notifications";

/**
 * Everything that happens once a deal's processing fee is confirmed paid —
 * shared by the Stripe webhook (automatic) and the manual "Mark paid"
 * button (for when Stripe shows payment but the deal never got the news,
 * e.g. the borrower paid a duplicate invoice the deal wasn't tracking).
 * No-ops the stage move + notifications unless the deal is at Negotiation,
 * so a retried webhook or a second click can't re-send anything.
 */
export async function handleProcessingFeePaid(dealId: string, changedByUserId: string | null): Promise<boolean> {
  await db.update(deals).set({ stripeInvoiceStatus: "paid" }).where(eq(deals.id, dealId));

  const advanced = await advanceDealStage(dealId, "negotiation", "application", changedByUserId);
  if (advanced) {
    await notifyBorrowerOfAcceptedTerms(dealId).catch((err) => {
      console.error("Failed to send borrower accepted-terms notification:", err);
    });
    await notifyProcessorOfPaidDeal(dealId).catch((err) => {
      console.error("Failed to send processor ready-to-process notification:", err);
    });
  }
  return advanced;
}
