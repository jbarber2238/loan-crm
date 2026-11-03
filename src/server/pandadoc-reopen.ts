import { and, eq, ne } from "drizzle-orm";
import { db } from "@/server/db/client";
import { dealClientNeeds, dealClientNeedDocuments } from "@/server/db/schema";
import { revertDocumentToDraft, waitUntilDraft, sendDocumentSilently } from "@/server/pandadoc";
import { recomputeNeedStatus } from "@/server/client-need-status";

// PandaDoc locks a form once the borrower finishes it. This puts the same document back in front of them: their
// answers stay filled in (only the signature is cleared) and it is re-sent silently so their upload-page link works.
//
// Not a server action on purpose (no "use server" here): callers do the auth check first.
//
// rejectExistingDocs: the manual "Reopen form" path has not rejected the signed copy yet, so it is moved to Rejected
// here and the new signed copy becomes the only active one. The Send to Borrower path passes false because a
// processor has already rejected it with their own note.
export async function reopenPandaDocNeed(
  needId: string,
  pandadocDocumentId: string,
  { rejectExistingDocs, reviewerUserId }: { rejectExistingDocs: boolean; reviewerUserId: string }
) {
  await revertDocumentToDraft(pandadocDocumentId);
  await waitUntilDraft(pandadocDocumentId);
  await sendDocumentSilently(pandadocDocumentId);

  if (rejectExistingDocs) {
    await db
      .update(dealClientNeedDocuments)
      .set({
        reviewStatus: "rejected",
        reviewedAt: new Date(),
        reviewedByUserId: reviewerUserId,
        rejectionNote: "This form was reopened so you can update your answers.",
      })
      // Copies already rejected keep their own reason; overwriting it would lose what the processor wrote.
      .where(and(eq(dealClientNeedDocuments.clientNeedId, needId), ne(dealClientNeedDocuments.reviewStatus, "rejected")));
  }
  // Set after any rejection above so the need reads as awaiting the borrower, not as rejected-and-unsent.
  await db
    .update(dealClientNeeds)
    .set({ pandadocStatus: "document.sent", lastSentAt: new Date() })
    .where(eq(dealClientNeeds.id, needId));
  await recomputeNeedStatus(needId);
}
