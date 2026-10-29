// A borrower doing a second deal under the same entity already has their entity documents on file.
// This file decides whether an earlier deal is "the same borrower" and which of its documents can move.

/** Lower-case, letters and digits only: "1776 Holding, LLC" and "1776 holding llc" compare equal. */
export function normalizeName(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export type EntityDocKind =
  | "articles"
  | "foreign"
  | "good_standing"
  | "operating_agreement"
  | "ein"
  // Optional extras: reusable on a repeat deal, but only if the processor decides they still apply.
  | "experience"
  | "budget"
  | "reo_schedule"
  | "drivers_license";

export interface CarryOverKindDef {
  kind: EntityDocKind;
  label: string;
  /** "entity" documents are pre-selected; "optional" ones are offered unchecked, with a warning. */
  group: "entity" | "optional";
  /** Comes over pending re-review instead of approved (and its need stays open). */
  needsReview: boolean;
  /** Lender-specific sheets only help when the new deal is with the same lender as the earlier one. */
  requiresSameLender: boolean;
  /** Shown beside optional documents. */
  note?: string;
  matches: (needName: string) => boolean;
}

export const ENTITY_DOC_KINDS: CarryOverKindDef[] = [
  { kind: "articles", label: "Articles of Organization / Incorporation", group: "entity", needsReview: false, requiresSameLender: false, matches: (n) => /articles of (organization|incorporation)/i.test(n) },
  { kind: "foreign", label: "Foreign entity status documents", group: "entity", needsReview: false, requiresSameLender: false, matches: (n) => /foreign entity/i.test(n) },
  { kind: "good_standing", label: "Certificate of Good Standing", group: "entity", needsReview: true, requiresSameLender: false, matches: (n) => /good standing/i.test(n) },
  { kind: "operating_agreement", label: "Operating Agreement", group: "entity", needsReview: false, requiresSameLender: false, matches: (n) => /operating agreement/i.test(n) },
  { kind: "ein", label: "EIN letter", group: "entity", needsReview: false, requiresSameLender: false, matches: (n) => /\bein\b/i.test(n) && !/ach|bank/i.test(n) },
  {
    kind: "experience",
    label: "Experience sheet",
    group: "optional",
    needsReview: true,
    requiresSameLender: true,
    note: "From the same lender. Add any projects completed since.",
    matches: (n) => /experience|track record/i.test(n),
  },
  {
    kind: "budget",
    label: "Construction / rehab budget",
    group: "optional",
    needsReview: true,
    requiresSameLender: true,
    note: "From the same lender. Only useful if this project is similar; edit the line items.",
    matches: (n) => /\bbudget\b/i.test(n),
  },
  {
    kind: "reo_schedule",
    label: "REO schedule",
    group: "optional",
    needsReview: true,
    requiresSameLender: false,
    note: "Update it with anything bought or sold since.",
    matches: (n) => /\breo\b/i.test(n),
  },
  {
    kind: "drivers_license",
    label: "Driver's license",
    group: "optional",
    needsReview: true,
    requiresSameLender: false,
    note: "Check that it hasn't expired.",
    matches: (n) => /driver/i.test(n),
  },
];

/**
 * What identifies one offered item: the document kind for the known ones, otherwise the need's own name
 * (so "Bank Statements" on the earlier deal lines up with "bank statements" on this one).
 */
export function carryOverKey(needName: string): string {
  return entityDocKindOf(needName) ?? `need:${normalizeName(needName)}`;
}

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
  items: OfferItem[];
}

export interface OfferItem {
  /** The kind for known documents, `need:<name>` for everything else. */
  key: string;
  label: string;
  fileCount: number;
  needsReview: boolean;
  group: "entity" | "optional";
  note?: string;
}
