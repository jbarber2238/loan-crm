"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { deals } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { runValueAssessment } from "@/server/ai/value-assessment";
import { runLenderMatch } from "@/server/ai/lender-match";
import { LOAN_CATEGORIES, PROPERTY_TYPES, labelFor } from "@/lib/labels";

export async function runValueAssessmentAction(dealId: string) {
  await requireUser();

  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) throw new Error("Deal not found");

  const result = await runValueAssessment({
    propertyAddress: deal.propertyAddress,
    loanCategory: labelFor(LOAN_CATEGORIES, deal.loanCategory),
    propertyType: deal.propertyType ? labelFor(PROPERTY_TYPES, deal.propertyType) : null,
    unitCount: deal.unitCount,
    purchasePrice: deal.purchasePrice ? Number(deal.purchasePrice) : null,
    estimatedAsIsValue: deal.estimatedAsIsValue ? Number(deal.estimatedAsIsValue) : null,
    estimatedArv: deal.estimatedArv ? Number(deal.estimatedArv) : null,
  });

  await db.update(deals).set({ aiValueAssessment: result }).where(eq(deals.id, dealId));
  revalidatePath(`/deals/${dealId}`);
  return result;
}

export async function runLenderMatchAction(dealId: string) {
  await requireUser();

  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) throw new Error("Deal not found");

  const result = await runLenderMatch(deal);

  await db.update(deals).set({ aiLenderMatch: result }).where(eq(deals.id, dealId));
  revalidatePath(`/deals/${dealId}`);
  return result;
}
