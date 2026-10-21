export type DealFileCategory = "insurance" | "title" | "other";

export const DEAL_FILE_CATEGORY_LABELS: Record<DealFileCategory, string> = {
  insurance: "Property Insurance (HOI)",
  title: "Title",
  other: "Other",
};

export const DEAL_FILE_MAX_BYTES = 15 * 1024 * 1024;
export const DEAL_FILE_NOTE_MAX = 1000;

export interface DealFileRow {
  id: string;
  category: DealFileCategory;
  fileName: string;
  fileSize: number;
  note: string | null;
  createdAt: Date;
  uploadedByName: string | null;
}

export function isDealFileCategory(value: string): value is DealFileCategory {
  return value === "insurance" || value === "title" || value === "other";
}

/** Checks an upload before it's saved; returns an error message or null. */
export function validateDealFileUpload(file: { size: number } | null, note: string): string | null {
  if (!file || file.size === 0) return "Choose a file to upload.";
  if (file.size > DEAL_FILE_MAX_BYTES) return "That file is over 15MB. Please upload a smaller one.";
  if (note.trim().length > DEAL_FILE_NOTE_MAX) return `Keep the note under ${DEAL_FILE_NOTE_MAX.toLocaleString("en-US")} characters.`;
  return null;
}

export type TrailEntry<E extends { createdAt: Date }, F extends { createdAt: Date }> =
  | { kind: "event"; at: Date; event: E }
  | { kind: "file"; at: Date; file: F };

/** One audit trail for an item: its status changes and its uploaded versions, newest first. */
export function mergeAuditTrail<E extends { createdAt: Date }, F extends { createdAt: Date }>(events: E[], files: F[]): TrailEntry<E, F>[] {
  const entries: TrailEntry<E, F>[] = [
    ...events.map((event) => ({ kind: "event" as const, at: new Date(event.createdAt), event })),
    ...files.map((file) => ({ kind: "file" as const, at: new Date(file.createdAt), file })),
  ];
  return entries.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/** "v3" style labels, oldest upload = v1, so a revision can be told apart at a glance. */
export function versionLabels<F extends { id: string; createdAt: Date }>(files: F[]): Map<string, string> {
  const oldestFirst = [...files].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  return new Map(oldestFirst.map((f, i) => [f.id, `v${i + 1}`]));
}
