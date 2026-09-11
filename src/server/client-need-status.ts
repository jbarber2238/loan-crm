import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { dealClientNeeds } from "@/server/db/schema";

// A document_upload need's status is entirely derived from its documents —
// never set directly — so every mutation to a need's documents (or its
// sentAt) re-derives it via this shared helper afterward.
export async function recomputeNeedStatus(needId: string) {
  const need = await db.query.dealClientNeeds.findFirst({
    where: eq(dealClientNeeds.id, needId),
    with: { documents: true },
  });
  if (!need) return;

  // minFiles > 1 (e.g. a driver's license needing front + back) means the
  // need can't be "accepted" until that many documents are approved, not
  // just one.
  const approvedCount = need.documents.filter((d) => d.reviewStatus === "approved").length;
  const hasEnoughApproved = approvedCount >= need.minFiles;
  const hasPending = need.documents.some((d) => d.reviewStatus === "pending");

  const status = hasEnoughApproved
    ? "accepted"
    : hasPending
      ? "review_needed"
      : need.sentAt
        ? "awaiting_docs"
        : "not_sent";

  await db.update(dealClientNeeds).set({ status }).where(eq(dealClientNeeds.id, needId));
}
