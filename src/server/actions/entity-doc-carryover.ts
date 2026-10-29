"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { dealCarryoverDismissals, dealNotes, deals } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { fail } from "@/lib/action-result";
import { performEntityDocCarryOver, planEntityDocCarryOver } from "@/server/entity-doc-carryover";

/** "Yes, copy these": brings the chosen entity documents over from the earlier deal. */
export async function copyEntityDocsFromPriorDeal(
  dealId: string,
  priorDealId: string,
  keys: string[],
  confirmedSameBorrower: boolean
) {
  const user = await requireUser();

  // Re-worked from scratch here, never trusted from the browser: the earlier deal, the files and the empty
  // slots all have to be exactly what the offer said.
  const plan = await planEntityDocCarryOver(dealId);
  if (!plan || plan.offer.prior.id !== priorDealId) return fail("That offer is no longer available. Refresh the page.");
  if (!plan.offer.emailMatches && !confirmedSameBorrower) return fail("Please confirm this is the same borrower first.");

  const chosen = plan.items.filter((i) => keys.includes(i.key));
  if (chosen.length === 0) return fail("Choose at least one document to copy.");

  const { copied, keys: copiedKeys } = await performEntityDocCarryOver(plan, keys, user.id, dealId);
  const copiedNames = plan.offer.items.filter((i) => copiedKeys.includes(i.key)).map((i) => i.label);

  await db
    .update(deals)
    .set({ entityDocsCarryoverStatus: "copied", entityDocsCarryoverAt: new Date() })
    .where(eq(deals.id, dealId));
  await db.insert(dealNotes).values({
    dealId,
    authorUserId: user.id,
    source: "system",
    body: `Copied ${copied} document${copied === 1 ? "" : "s"} (${copiedNames.join(", ")}) from loan #${plan.offer.prior.loanNumber}, ${plan.offer.prior.address}. ${
      plan.offer.emailMatches ? "" : "Staff confirmed it is the same borrower (the email on file differs). "
    }Approved entity documents were marked accepted; everything else came over for review and may need editing.`,
  });

  revalidatePath(`/deals/${dealId}/loan-center`);
  return { copied, from: plan.offer.prior.loanNumber };
}

/**
 * "No thanks" (or "not the same borrower"): stops the question for this person only. Everyone else who opens
 * the deal keeps seeing it until they answer too, or someone copies the documents.
 */
export async function declineEntityDocCarryOver(dealId: string) {
  const user = await requireUser();
  await db.insert(dealCarryoverDismissals).values({ dealId, userId: user.id }).onConflictDoNothing();
  revalidatePath(`/deals/${dealId}/loan-center`);
  return { declined: true as const };
}
