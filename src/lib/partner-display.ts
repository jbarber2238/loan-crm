// What a partner is allowed to see about a borrower and a property.

export function borrowerLabel(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  return last ? `${first} ${last[0].toUpperCase()}.` : first;
}

export function cityFrom(address: string): string {
  const parts = address.split(",").map((p) => p.trim());
  if (parts.length >= 3) return parts[1];
  if (parts.length === 2) return parts[1].replace(/\s*\d{5}(-\d{4})?\s*$/, "").trim() || parts[1];
  return "—";
}
