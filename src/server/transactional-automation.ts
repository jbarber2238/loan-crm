import { and, inArray, isNull, lt } from "drizzle-orm";
import { db } from "@/server/db/client";
import { transactionalLoans } from "@/server/db/schema";
import { ARCHIVE_AFTER_DAYS_IN_STAGE, DELETED_DEAL_PURGE_AFTER_DAYS } from "@/lib/deal-pipeline";

// Same "runs lazily on page load" convention as the deals pipeline
// (src/server/deal-stage-automation.ts): there's no scheduler, so anyone
// opening the transactional board triggers these before it queries.

/** Closed/Lost requests untouched for 30 days come off the board (still on file, restorable). */
export async function autoArchiveStaleTransactionalLoans() {
  const cutoff = new Date(Date.now() - ARCHIVE_AFTER_DAYS_IN_STAGE * 24 * 60 * 60 * 1000);
  const archived = await db
    .update(transactionalLoans)
    .set({ archivedAt: new Date(), archivedByUserId: null })
    .where(
      and(
        inArray(transactionalLoans.stage, ["closed", "lost"]),
        isNull(transactionalLoans.archivedAt),
        isNull(transactionalLoans.deletedAt),
        lt(transactionalLoans.stageChangedAt, cutoff)
      )
    )
    .returning({ id: transactionalLoans.id });
  return archived.length;
}

/** Soft-deleted requests are removed for good after 30 days; no recovery after this. */
export async function purgeExpiredDeletedTransactionalLoans() {
  const cutoff = new Date(Date.now() - DELETED_DEAL_PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const purged = await db
    .delete(transactionalLoans)
    .where(lt(transactionalLoans.deletedAt, cutoff))
    .returning({ id: transactionalLoans.id });
  return purged.length;
}
