export type DealClientNeedStatus =
  | "not_sent"
  | "awaiting_docs"
  | "review_needed"
  | "accepted"
  | "document_rejected_not_sent"
  | "need_rejected_not_sent"
  | "unused";

export interface NeedForStatus {
  // Set only by the explicit "Accept Need" action — approving documents
  // (one, several, or all of them) never sets this by itself. See the
  // acceptedAt column comment in schema.ts.
  acceptedAt: Date | null;
  sentAt: Date | null;
  lastSentAt: Date | null;
  documents: { reviewStatus: "pending" | "approved" | "rejected"; reviewedAt: Date | null }[];
}

// Pure, DB-free derivation — the single source of truth for a document_upload
// need's status. Kept out of src/server so it's importable from a test
// without pulling in the DB client (which throws at import time without
// DATABASE_URL) — see src/server/client-need-status.ts for the DB-backed
// recomputeNeedStatus that wraps this.
export function deriveNeedStatus(need: NeedForStatus): DealClientNeedStatus {
  const hasPending = need.documents.some((d) => d.reviewStatus === "pending");

  const rejectedDocs = need.documents.filter((d) => d.reviewStatus === "rejected");
  const hasAnyRejected = rejectedDocs.length > 0;
  // Every document on the need is rejected — whether because it only ever
  // had one, or because "Reject Need" rejected all of them at once — reads
  // as the whole need being rejected, not just one document within it.
  const allRejected = need.documents.length > 0 && rejectedDocs.length === need.documents.length;
  const latestRejectedAt = rejectedDocs.length
    ? new Date(Math.max(...rejectedDocs.map((d) => d.reviewedAt?.getTime() ?? 0)))
    : null;
  // Has the processor manually re-sent the need since the most recent
  // rejection? If so, the borrower's already been told — no need to keep
  // excluding this from the automatic reminder.
  const resentSinceRejection = Boolean(
    need.lastSentAt && latestRejectedAt && need.lastSentAt >= latestRejectedAt
  );

  if (need.acceptedAt) return "accepted";
  if (hasPending) return "review_needed";
  if (hasAnyRejected && !resentSinceRejection) {
    return allRejected ? "need_rejected_not_sent" : "document_rejected_not_sent";
  }
  return need.sentAt ? "awaiting_docs" : "not_sent";
}

// A need whose rejection hasn't been resolved yet: nothing in it is pending or
// approved, only rejected documents (and the borrower hasn't been re-asked).
const UNRESOLVED_REJECTION_STATUSES = new Set(["need_rejected_not_sent", "document_rejected_not_sent"]);

/**
 * Moving a rejected document into a client need that isn't itself in a rejected
 * state puts the document back under review automatically — no separate
 * Restore click. Moving it into a still-rejected need leaves it rejected.
 * (A document that isn't rejected is never touched by a move.)
 */
export function shouldRestoreOnMove(documentReviewStatus: string, destinationNeedStatus: string | null): boolean {
  if (documentReviewStatus !== "rejected") return false;
  return destinationNeedStatus === null || !UNRESOLVED_REJECTION_STATUSES.has(destinationNeedStatus);
}
