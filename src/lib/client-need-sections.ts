// How the Client Needs tab groups and orders a deal's needs: sections by where each need stands, and newest activity
// first inside each section. Kept free of React and the database so the rules can be tested on their own.

export type NeedSectionKey = "accepted" | "review_needed" | "not_sent" | "awaiting" | "rejected" | "on_hold";

export const NEED_SECTIONS: { key: NeedSectionKey; label: string }[] = [
  { key: "accepted", label: "Accepted" },
  { key: "review_needed", label: "Review Needed" },
  { key: "not_sent", label: "Not Sent" },
  { key: "awaiting", label: "Awaiting Docs" },
  { key: "rejected", label: "Rejected" },
  { key: "on_hold", label: "On Hold" },
];

type SectionInput = { status: string; onHoldAt: Date | null };

/** On Hold wins over everything else, accepted or not: a held need is parked until someone resumes it. */
export function sectionOf(need: SectionInput): NeedSectionKey {
  if (need.onHoldAt) return "on_hold";
  switch (need.status) {
    case "accepted":
      return "accepted";
    case "review_needed":
      return "review_needed";
    case "need_rejected_not_sent":
    case "document_rejected_not_sent":
      return "rejected";
    case "awaiting_docs":
      return "awaiting";
    default:
      return "not_sent";
  }
}

type TouchInput = {
  createdAt?: Date | null;
  touchedAt?: Date | null;
  sentAt?: Date | null;
  lastSentAt?: Date | null;
  acceptedAt?: Date | null;
  onHoldAt?: Date | null;
  customFormSubmittedAt?: Date | null;
};

/**
 * The most recent thing that happened on a need: a file uploaded or reviewed, it was sent to the borrower, accepted,
 * un-accepted, held, edited, or its form submitted. A need nobody has touched falls back to when it was added.
 */
export function lastTouchedAt(need: TouchInput, documents: { createdAt?: Date | null; reviewedAt?: Date | null }[] = []): Date {
  const times = [
    need.createdAt,
    need.touchedAt,
    need.sentAt,
    need.lastSentAt,
    need.acceptedAt,
    need.onHoldAt,
    need.customFormSubmittedAt,
    ...documents.flatMap((d) => [d.createdAt, d.reviewedAt]),
  ]
    .filter((t): t is Date => t instanceof Date && !Number.isNaN(t.getTime()))
    .map((t) => t.getTime());
  return new Date(times.length ? Math.max(...times) : 0);
}

/** Sections in their fixed order, empty ones left out, each holding its needs newest activity first. */
export function groupNeedsIntoSections<T extends SectionInput & { lastTouchedAt: Date }>(needs: T[]): { key: NeedSectionKey; label: string; needs: T[] }[] {
  return NEED_SECTIONS.map((section) => ({
    ...section,
    // Array.sort is stable, so needs touched at the same moment keep the deal's own checklist order.
    needs: needs.filter((n) => sectionOf(n) === section.key).sort((a, b) => b.lastTouchedAt.getTime() - a.lastTouchedAt.getTime()),
  })).filter((section) => section.needs.length > 0);
}
