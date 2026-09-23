"use server";

import { randomBytes } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { deals, dealConversionLinks, dealNotes } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { createDealFromIntake } from "@/server/actions/deals";
import { CONVERTIBLE_TO_DSCR_REFI_CATEGORIES } from "@/lib/loan-sections";
import { DSCR_REFI_TARGET_CATEGORIES } from "@/lib/labels";

/** Called from the deal page (Overview/header) to generate a fresh, unique
 * link for staff to copy and send to the borrower directly — same "just a
 * copyable URL" pattern as the existing per-loan-officer intake link. */
export async function createDscrConversionLink(dealId: string) {
  const user = await requireUser();

  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) throw new Error("Deal not found");
  if (!CONVERTIBLE_TO_DSCR_REFI_CATEGORIES.has(deal.loanCategory)) {
    throw new Error("DSCR refinance conversion links are only available for Fix and Flip or New Construction loans.");
  }

  // Reuse an existing, not-yet-submitted link for this deal rather than
  // minting a new one every time the dialog is opened — this button will
  // get clicked more than once per deal (checking the link, re-copying it),
  // and there's no reason for each of those to leave behind its own row.
  const existing = await db.query.dealConversionLinks.findFirst({
    where: and(eq(dealConversionLinks.sourceDealId, dealId), isNull(dealConversionLinks.usedAt)),
  });
  if (existing) return existing.token;

  const token = randomBytes(24).toString("base64url");
  await db.insert(dealConversionLinks).values({
    token,
    sourceDealId: dealId,
    createdByUserId: user.id,
  });

  revalidatePath(`/deals/${dealId}`);
  return token;
}

/** Loads everything the public /dscr-refi/[token] page needs to render —
 * null if the token doesn't exist. Doesn't require auth; the token itself is
 * the credential, same as the existing borrower-upload-link pattern. */
export async function getConversionLinkData(token: string) {
  const link = await db.query.dealConversionLinks.findFirst({ where: eq(dealConversionLinks.token, token) });
  if (!link) return null;

  const sourceDeal = await db.query.deals.findFirst({ where: eq(deals.id, link.sourceDealId) });
  if (!sourceDeal) return null;

  return { link, sourceDeal };
}

export async function submitConversionIntake(token: string, formData: FormData) {
  const link = await db.query.dealConversionLinks.findFirst({ where: eq(dealConversionLinks.token, token) });
  if (!link) throw new Error("This link is invalid.");
  if (link.usedAt) throw new Error("This link has already been used.");

  const sourceDeal = await db.query.deals.findFirst({ where: eq(deals.id, link.sourceDealId) });
  if (!sourceDeal) throw new Error("The original deal this link was created from no longer exists.");

  const loanCategory = formData.get("loanCategory");
  if (typeof loanCategory !== "string" || !DSCR_REFI_TARGET_CATEGORIES.some((c) => c.value === loanCategory)) {
    throw new Error("Select whether this is a cash-out or rate & term refinance.");
  }

  const newDealId = await createDealFromIntake(formData, {
    assignedLoanOfficerId: sourceDeal.assignedLoanOfficerId,
    assignedProcessorId: sourceDeal.assignedProcessorId,
    assignedAssistantId: sourceDeal.assignedAssistantId,
    driveLink: null,
    noteAuthorUserId: null,
    stageChangedByUserId: sourceDeal.assignedLoanOfficerId,
  });

  await db
    .update(dealConversionLinks)
    .set({ usedAt: new Date(), resultingDealId: newDealId })
    .where(eq(dealConversionLinks.id, link.id));

  const newDeal = await db.query.deals.findFirst({
    where: eq(deals.id, newDealId),
    columns: { loanNumber: true },
  });

  await db.insert(dealNotes).values({
    dealId: newDealId,
    authorUserId: null,
    source: "system",
    body: `Converted from Loan #${sourceDeal.loanNumber} (${sourceDeal.propertyAddress}) via DSCR refinance intake link.`,
  });
  await db.insert(dealNotes).values({
    dealId: sourceDeal.id,
    authorUserId: null,
    source: "system",
    body: `Borrower submitted the DSCR refinance intake — converted to new Loan #${newDeal?.loanNumber ?? "?"}.`,
  });

  revalidatePath(`/deals/${sourceDeal.id}`);
  redirect(`/dscr-refi/${token}?submitted=1`);
}
