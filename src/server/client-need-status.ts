import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { dealClientNeeds } from "@/server/db/schema";
import { deriveNeedStatus } from "@/lib/client-need-status";

export type { DealClientNeedStatus } from "@/lib/client-need-status";
export { deriveNeedStatus } from "@/lib/client-need-status";

// A document_upload need's status is entirely derived from its documents —
// never set directly — so every mutation to a need's documents (or its
// sentAt/lastSentAt) re-derives it via this shared helper afterward.
//
// A need marked Unused (or a deleted need that's only kept as the record of its
// rejected documents) stays Unused through ordinary document changes — moving a
// document away from it must not quietly put it back on the Client Needs list.
// Only an explicit restore passes reviveUnused.
export async function recomputeNeedStatus(needId: string, options: { reviveUnused?: boolean } = {}) {
  const need = await db.query.dealClientNeeds.findFirst({
    where: eq(dealClientNeeds.id, needId),
    with: { documents: true },
  });
  if (!need) return;
  if (need.status === "unused" && !options.reviveUnused) return;

  await db
    .update(dealClientNeeds)
    .set({ status: deriveNeedStatus(need) })
    .where(eq(dealClientNeeds.id, needId));
}
