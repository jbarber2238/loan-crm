"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { dealNotes, deals } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { fail } from "@/lib/action-result";
import { performEntityDocCarryOver, planEntityDocCarryOver } from "@/server/entity-doc-carryover";
import type { EntityDocKind } from "@/lib/entity-doc-carryover";

/** "Yes, copy these": brings the chosen entity documents over from the earlier deal. */
export async function copyEntityDocsFromPriorDeal(
  dealId: string,
  priorDealId: string,
  kinds: EntityDocKind[],
  confirmedSameBorrower: boolean
) {
  const user = await requireUser();

  // Re-worked from scratch here, never trusted from the browser: the earlier deal, the files and the empty
  // slots all have to be exactly what the offer said.
  const plan = await planEntityDocCarryOver(dealId);
  if (!plan || plan.offer.prior.id !== priorDealId) return fail("That offer is no longer available. Refresh the page.");
  if (!plan.offer.emailMatches && !confirmedSameBorrower) return fail("Please confirm this is the same borrower first.");

  const chosen = plan.items.filter((i) => kinds.includes(i.kind));
  if (chosen.length === 0) return fail("Choose at least one document to copy.");

  const { copied, kinds: copiedKinds } = await performEntityDocCarryOver(plan, kinds, user.id);

  await db
    .update(deals)
    .set({ entityDocsCarryoverStatus: "copied", entityDocsCarryoverAt: new Date() })
    .where(eq(deals.id, dealId));
  await db.insert(dealNotes).values({
    dealId,
    authorUserId: user.id,
    source: "system",
    body: `Copied ${copied} entity document${copied === 1 ? "" : "s"} (${copiedKinds.map((k) => k.replace(/_/g, " ")).join(", ")}) from loan #${plan.offer.prior.loanNumber}, ${plan.offer.prior.address}. ${
      plan.offer.emailMatches ? "" : "Staff confirmed it is the same borrower (the email on file differs). "
    }Approved documents were marked accepted; ones that go stale came over for re-review.`,
  });

  revalidatePath(`/deals/${dealId}/loan-center`);
  return { copied, from: plan.offer.prior.loanNumber };
}

/** "No thanks" (or "not the same borrower"): records the answer so the question isn't asked again on this deal. */
export async function declineEntityDocCarryOver(dealId: string) {
  await requireUser();
  await db
    .update(deals)
    .set({ entityDocsCarryoverStatus: "declined", entityDocsCarryoverAt: new Date() })
    .where(eq(deals.id, dealId));
  revalidatePath(`/deals/${dealId}/loan-center`);
  return { declined: true as const };
}
