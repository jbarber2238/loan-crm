import { expireStaleFollowUps, autoArchiveStaleDeals, purgeExpiredDeletedDeals } from "@/server/deal-stage-automation";
import { autoArchiveStaleTransactionalLoans, purgeExpiredDeletedTransactionalLoans } from "@/server/transactional-automation";

export const maxDuration = 60;

// The deal clean-up sweeps (Follow-up deals that have sat too long become Lost, old Closed/Lost deals get
// archived, long-deleted deals are purged). These used to run at the top of every pipeline and deal page, so
// whoever opened a page first after a deal became eligible waited for all of it, including the emails and
// partner notifications a stage change sends. They run here instead; every cutoff is measured in days, so a
// few minutes' delay changes nothing anyone can see.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  // One at a time: each can move a deal, and none of them needs to race another.
  const expiredFollowUps = await expireStaleFollowUps();
  const archived = await autoArchiveStaleDeals();
  const purged = await purgeExpiredDeletedDeals();
  const archivedTransactional = await autoArchiveStaleTransactionalLoans();
  const purgedTransactional = await purgeExpiredDeletedTransactionalLoans();
  return Response.json({ expiredFollowUps, archived, purged, archivedTransactional, purgedTransactional });
}
