import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals, dealNotes, dealStageHistory } from "@/server/db/schema";
import {
  ARCHIVABLE_STAGES,
  ARCHIVE_AFTER_DAYS_IN_STAGE,
  DELETED_DEAL_PURGE_AFTER_DAYS,
  FOLLOW_UP_AUTO_LOST_DAYS,
} from "@/lib/deal-pipeline";

// No cron/scheduled-job runner exists in this app yet, so this runs lazily
// on page load instead (called from the pipeline board and deal detail
// pages, before they query deals) — the practical effect is the same, since
// anyone viewing the pipeline triggers the check and the page's own query
// picks up the result immediately. It just won't fire the instant 7 days is
// up if nobody has the app open. No revalidatePath here — the caller is
// mid-render and about to query fresh data itself.
export async function expireStaleFollowUps() {
  const cutoff = new Date(Date.now() - FOLLOW_UP_AUTO_LOST_DAYS * 24 * 60 * 60 * 1000);
  const stale = await db.query.deals.findMany({
    where: and(eq(deals.stage, "follow_up"), lt(deals.pausedAt, cutoff)),
  });
  if (!stale.length) return 0;

  for (const deal of stale) {
    await db
      .update(deals)
      .set({
        stage: "lost",
        lostReason: `Automatically moved to Lost after sitting in Follow-up for ${FOLLOW_UP_AUTO_LOST_DAYS}+ days with no update.${
          deal.pauseReason ? ` Follow-up reason was: ${deal.pauseReason}` : ""
        }`,
        pauseReason: null,
        pausedFromStage: null,
        pausedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(deals.id, deal.id));

    await db.insert(dealStageHistory).values({ dealId: deal.id, stage: "lost", changedByUserId: null });
    await db.insert(dealNotes).values({
      dealId: deal.id,
      authorUserId: null,
      source: "system",
      body: `Automatically moved to Lost after ${FOLLOW_UP_AUTO_LOST_DAYS} days in Follow-up with no activity.`,
    });
  }

  return stale.length;
}

// Same "runs lazily on page load" convention as expireStaleFollowUps above —
// called from the same two places (pipeline board, deal detail layout).
// "30 days in Closed/Lost" is measured from the most recent time the deal
// actually entered that stage (its latest dealStageHistory row), same
// source the pipeline board's own "Xd in stage" already reads from — not
// updatedAt, which any unrelated edit would bump and reset the clock on.
export async function autoArchiveStaleDeals() {
  const cutoff = new Date(Date.now() - ARCHIVE_AFTER_DAYS_IN_STAGE * 24 * 60 * 60 * 1000);
  const candidates = await db.query.deals.findMany({
    where: and(
      inArray(deals.stage, [...ARCHIVABLE_STAGES] as (typeof deals.stage.enumValues)[number][]),
      isNull(deals.archivedAt),
      isNull(deals.deletedAt)
    ),
    with: { stageHistory: true },
  });

  const stale = candidates.filter((deal) => {
    const enteredAt = deal.stageHistory.reduce<Date | null>(
      (latest, h) => (!latest || h.changedAt > latest ? h.changedAt : latest),
      null
    );
    return (enteredAt ?? deal.createdAt) < cutoff;
  });
  if (!stale.length) return 0;

  for (const deal of stale) {
    await db
      .update(deals)
      .set({ archivedAt: new Date(), archivedByUserId: null })
      .where(eq(deals.id, deal.id));
  }

  return stale.length;
}

// Same lazy-on-page-load convention — hard-deletes (cascading to every
// related row: term sheets, pricing requests, notes, client needs, etc.)
// any deal a person soft-deleted more than DELETED_DEAL_PURGE_AFTER_DAYS
// ago. There is no recovery after this runs; deleteDeal/restoreDeletedDeal
// are the only two places a deal's fate is otherwise decided.
export async function purgeExpiredDeletedDeals() {
  const cutoff = new Date(Date.now() - DELETED_DEAL_PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const expired = await db.query.deals.findMany({
    where: lt(deals.deletedAt, cutoff),
    columns: { id: true },
  });
  if (!expired.length) return 0;

  await db.delete(deals).where(
    inArray(
      deals.id,
      expired.map((d) => d.id)
    )
  );

  return expired.length;
}
