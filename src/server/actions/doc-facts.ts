"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { dealClientNeedDocuments, dealClientNeeds, dealNotes, deals } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { fail, type ActionError } from "@/lib/action-result";
import { formatDayShort, type DocFactKind } from "@/lib/doc-facts";
import { isDateString } from "@/lib/tasks";

type Ok = { ok: true };

/** The scanned fact, read from the stored scan (never from the browser), for a document that belongs to this deal. */
async function scannedDay(dealId: string, documentId: string, kind: DocFactKind, field: string) {
  const doc = await db.query.dealClientNeedDocuments.findFirst({
    where: eq(dealClientNeedDocuments.id, documentId),
    columns: { aiDocFacts: true, fileName: true, clientNeedId: true },
  });
  if (!doc) return null;
  const need = await db.query.dealClientNeeds.findFirst({ where: eq(dealClientNeeds.id, doc.clientNeedId), columns: { dealId: true } });
  if (!need || need.dealId !== dealId) return null;
  const facts = doc.aiDocFacts;
  if (!facts || facts.kind !== kind) return null;
  const cell = facts.fields[field];
  if (!cell?.value || !isDateString(cell.value)) return null;
  return { day: cell.value, page: cell.page, fileName: doc.fileName };
}

function pageText(page: number | null) {
  return page ? `, page ${page}` : "";
}

/** The processor has checked the scan: copy the purchase agreement's closing date onto the deal's Est. Closing Date. */
export async function applyContractClosingDate(dealId: string, documentId: string): Promise<Ok | ActionError> {
  const user = await requireUser();
  const found = await scannedDay(dealId, documentId, "purchase_contract", "closingDate");
  if (!found) return fail("That scan no longer has a closing date. Run the AI scan again.");

  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId), columns: { estimatedClosingDate: true } });
  if (!deal) return fail("That deal couldn't be found.");
  const before = deal.estimatedClosingDate ? deal.estimatedClosingDate.toISOString().slice(0, 10) : null;
  if (before === found.day) return { ok: true };

  await db.update(deals).set({ estimatedClosingDate: new Date(found.day), updatedAt: new Date() }).where(eq(deals.id, dealId));
  await db.insert(dealNotes).values({
    dealId,
    authorUserId: null,
    source: "system",
    body: `Est. Closing Date ${before ? `changed from ${formatDayShort(before)} to` : "set to"} ${formatDayShort(found.day)} from the purchase agreement scan (${found.fileName}${pageText(found.page)}), accepted by ${user.name?.trim() || "a teammate"}.`,
  });
  revalidatePath(`/deals/${dealId}`, "layout");
  revalidatePath("/dashboard");
  return { ok: true };
}

/** The processor has checked the scan: copy the payoff statement's expiration date into Key Dates. */
export async function applyPayoffExpirationDate(dealId: string, documentId: string): Promise<Ok | ActionError> {
  const user = await requireUser();
  const found = await scannedDay(dealId, documentId, "payoff_statement", "expirationDate");
  if (!found) return fail("That scan no longer has an expiration date. Run the AI scan again.");

  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId), columns: { payoffExpirationDate: true } });
  if (!deal) return fail("That deal couldn't be found.");
  const before = deal.payoffExpirationDate ? deal.payoffExpirationDate.toISOString().slice(0, 10) : null;
  if (before === found.day) return { ok: true };

  await db.update(deals).set({ payoffExpirationDate: new Date(found.day), updatedAt: new Date() }).where(eq(deals.id, dealId));
  await db.insert(dealNotes).values({
    dealId,
    authorUserId: null,
    source: "system",
    body: `Payoff Expiration Date ${before ? `changed from ${formatDayShort(before)} to` : "set to"} ${formatDayShort(found.day)} from the payoff statement scan (${found.fileName}${pageText(found.page)}), accepted by ${user.name?.trim() || "a teammate"}.`,
  });
  revalidatePath(`/deals/${dealId}/loan-center`);
  return { ok: true };
}
