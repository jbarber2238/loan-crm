export interface RecipientCandidate {
  label: string;
  email: string;
  isFollower?: boolean;
}

/** Appends an email to a comma-separated recipient string, skipping duplicates. */
export function addRecipient(existing: string, email: string): string {
  const current = existing
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
  if (current.some((e) => e.toLowerCase() === email.toLowerCase())) return existing;
  return [...current, email].join(", ");
}
