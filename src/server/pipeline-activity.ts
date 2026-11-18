import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { dealClientNeedDocuments, dealClientNeeds, dealConditions, dealKeyDateEvents, dealNotes } from "@/server/db/schema";
import { latestOf } from "@/lib/pipeline-list";

export interface DealActivity {
  /** The newest of: a note, a client need being sent / accepted / edited, a document uploaded or reviewed, a Key Dates entry. */
  lastActivityAt: Date | null;
  needsToReview: number;
  openConditions: number;
}

/**
 * What the processor list shows per deal beyond the deal's own columns. One grouped query per source and no file
 * contents, so it stays cheap on a page that renders every active deal.
 */
export async function loadDealActivity(dealIds: string[]): Promise<Map<string, DealActivity>> {
  const result = new Map<string, DealActivity>();
  if (!dealIds.length) return result;
  const entry = (id: string) => {
    let e = result.get(id);
    if (!e) result.set(id, (e = { lastActivityAt: null, needsToReview: 0, openConditions: 0 }));
    return e;
  };
  const bump = (id: string, at: Date | null) => {
    const e = entry(id);
    e.lastActivityAt = latestOf([e.lastActivityAt, at]);
  };

  const needTouch = sql`greatest(${dealClientNeeds.createdAt}, ${dealClientNeeds.touchedAt}, ${dealClientNeeds.sentAt}, ${dealClientNeeds.lastSentAt}, ${dealClientNeeds.acceptedAt}, ${dealClientNeeds.onHoldAt}, ${dealClientNeeds.customFormSubmittedAt})`;
  const docTouch = sql`greatest(${dealClientNeedDocuments.createdAt}, ${dealClientNeedDocuments.reviewedAt})`;

  const [notes, needs, docs, keyDates, review, conditions] = await Promise.all([
    db.select({ dealId: dealNotes.dealId, at: sql<string | null>`max(${dealNotes.createdAt})` }).from(dealNotes).where(inArray(dealNotes.dealId, dealIds)).groupBy(dealNotes.dealId),
    db.select({ dealId: dealClientNeeds.dealId, at: sql<string | null>`max(${needTouch})` }).from(dealClientNeeds).where(inArray(dealClientNeeds.dealId, dealIds)).groupBy(dealClientNeeds.dealId),
    db
      .select({ dealId: dealClientNeeds.dealId, at: sql<string | null>`max(${docTouch})` })
      .from(dealClientNeedDocuments)
      .innerJoin(dealClientNeeds, eq(dealClientNeedDocuments.clientNeedId, dealClientNeeds.id))
      .where(inArray(dealClientNeeds.dealId, dealIds))
      .groupBy(dealClientNeeds.dealId),
    db.select({ dealId: dealKeyDateEvents.dealId, at: sql<string | null>`max(${dealKeyDateEvents.createdAt})` }).from(dealKeyDateEvents).where(inArray(dealKeyDateEvents.dealId, dealIds)).groupBy(dealKeyDateEvents.dealId),
    db
      .select({ dealId: dealClientNeeds.dealId, n: sql<number>`count(*)::int` })
      .from(dealClientNeeds)
      .where(and(inArray(dealClientNeeds.dealId, dealIds), eq(dealClientNeeds.status, "review_needed"), sql`${dealClientNeeds.onHoldAt} is null`))
      .groupBy(dealClientNeeds.dealId),
    db
      .select({ dealId: dealConditions.dealId, n: sql<number>`count(*)::int` })
      .from(dealConditions)
      .where(and(inArray(dealConditions.dealId, dealIds), eq(dealConditions.status, "open")))
      .groupBy(dealConditions.dealId),
  ]);

  // Raw max() comes back as text from the database; these columns hold UTC wall-clock times, so read them as UTC.
  const toDate = (v: string | Date | null) => (v == null ? null : v instanceof Date ? v : new Date(`${v.replace(" ", "T")}${/[zZ]|[+-]\d\d(:?\d\d)?$/.test(v) ? "" : "Z"}`));
  for (const rows of [notes, needs, docs, keyDates]) for (const r of rows) bump(r.dealId, toDate(r.at));
  for (const r of review) entry(r.dealId).needsToReview = r.n;
  for (const r of conditions) entry(r.dealId).openConditions = r.n;
  return result;
}
