// A borrower doing a second deal under the same entity already has their entity documents on file.
// This file decides whether an earlier deal is "the same borrower" and which of its documents can move.

/** Lower-case, letters and digits only: "1776 Holding, LLC" and "1776 holding llc" compare equal. */
export function normalizeName(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export type EntityDocKind = "articles" | "foreign" | "good_standing" | "operating_agreement" | "ein";

export const ENTITY_DOC_KINDS: {
  kind: EntityDocKind;
  label: string;
  /** A certificate of good standing goes stale, so it comes over for a quick re-review instead of pre-approved. */
  needsReview: boolean;
  matches: (needName: string) => boolean;
}[] = [
  { kind: "articles", label: "Articles of Organization / Incorporation", needsReview: false, matches: (n) => /articles of (organization|incorporation)/i.test(n) },
  { kind: "foreign", label: "Foreign entity status documents", needsReview: false, matches: (n) => /foreign entity/i.test(n) },
  { kind: "good_standing", label: "Certificate of Good Standing", needsReview: true, matches: (n) => /good standing/i.test(n) },
  { kind: "operating_agreement", label: "Operating Agreement", needsReview: false, matches: (n) => /operating agreement/i.test(n) },
  { kind: "ein", label: "EIN letter", needsReview: false, matches: (n) => /\bein\b/i.test(n) && !/ach|bank/i.test(n) },
];

/** Which kind of entity document a client need is, if any. */
export function entityDocKindOf(needName: string): EntityDocKind | null {
  return ENTITY_DOC_KINDS.find((k) => k.matches(needName))?.kind ?? null;
}

export interface PersonKey {
  borrowerName: string;
  borrowerEmail: string | null;
  borrowerEntityName: string | null;
}

/**
 * Is an earlier deal the same borrower? The name and entity must match. The email decides how sure we
 * are: if it matches too we go straight to the offer, if not we ask "is this the same borrower?" first.
 */
export function compareBorrowers(current: PersonKey, earlier: PersonKey): { same: boolean; emailMatches: boolean } {
  const entity = normalizeName(current.borrowerEntityName);
  const same =
    entity !== "" &&
    entity === normalizeName(earlier.borrowerEntityName) &&
    normalizeName(current.borrowerName) !== "" &&
    normalizeName(current.borrowerName) === normalizeName(earlier.borrowerName);
  const a = (current.borrowerEmail ?? "").trim().toLowerCase();
  const b = (earlier.borrowerEmail ?? "").trim().toLowerCase();
  return { same, emailMatches: same && a !== "" && a === b };
}

/** What the staff member is shown: the earlier deal and the documents that can come over. */
export interface EntityDocOffer {
  /** The email on the deal being worked, shown beside the earlier deal's when they differ. */
  currentBorrowerEmail: string | null;
  prior: { id: string; loanNumber: number; address: string; borrowerName: string; borrowerEmail: string | null };
  /** False means the email on the earlier deal differs, so staff confirm it's the same person first. */
  emailMatches: boolean;
  items: { kind: EntityDocKind; label: string; fileCount: number; needsReview: boolean }[];
}
