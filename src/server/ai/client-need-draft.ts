"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { products } from "@/server/db/schema";
import { requireClientNeedsEditor } from "@/server/auth/guards";
import { generateClientNeedDraft, type ClientNeedDraftCore } from "@/server/ai/client-need-draft-core";

export interface ClientNeedDraft extends Omit<ClientNeedDraftCore, "lender"> {
  /**
   * Set when the request named a lender on file: the need is tagged for that lender (internal only), and the form asks
   * which of that lender's products should get it. `products` is that lender's active products.
   */
  lender: { id: string; name: string; products: { id: string; name: string }[] } | null;
}

export async function draftClientNeedWithAI(prompt: string): Promise<ClientNeedDraft> {
  // Same people who can create a need by hand: admins and processors.
  await requireClientNeedsEditor();

  const lenders = await db.query.lenders.findMany({ columns: { id: true, name: true } });
  const { draft, lender } = await generateClientNeedDraft(prompt, lenders);
  if (!lender) return { ...draft, lender: null };

  const lenderProducts = await db.query.products.findMany({
    where: and(eq(products.lenderId, lender.id), eq(products.active, true)),
    columns: { id: true, name: true },
  });
  lenderProducts.sort((a, b) => a.name.localeCompare(b.name));

  return { ...draft, lender: { id: lender.id, name: lender.name, products: lenderProducts } };
}
