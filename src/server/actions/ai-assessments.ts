"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { deals } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { runLenderMatch } from "@/server/ai/lender-match";

export async function runLenderMatchAction(dealId: string) {
  await requireUser();

  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) throw new Error("Deal not found");

  const result = await runLenderMatch(deal);

  await db.update(deals).set({ aiLenderMatch: result }).where(eq(deals.id, dealId));
  revalidatePath(`/deals/${dealId}`);
  return result;
}
