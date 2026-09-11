import { and, eq, lt } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals, dealNotes, dealStageHistory } from "@/server/db/schema";
import { FOLLOW_UP_AUTO_LOST_DAYS } from "@/lib/deal-pipeline";

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
