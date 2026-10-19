export const CLIENT_NEEDS_NOTE_MAX = 2000;

/** Trims the note; an empty one means "remove it". Returns an error message when it's too long. */
export function normalizeClientNeedsNote(raw: string): { note: string | null } | { error: string } {
  const note = raw.trim();
  if (note.length > CLIENT_NEEDS_NOTE_MAX) {
    return { error: `Keep the note under ${CLIENT_NEEDS_NOTE_MAX.toLocaleString("en-US")} characters.` };
  }
  return { note: note || null };
}
