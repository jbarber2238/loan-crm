export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Standard US postal format: "Street, City, ST ZIP" — comma between street
// and city and between city and state, but a space (no comma) before the ZIP.
export function formatAddress(
  street: string | null,
  city: string | null,
  state: string | null,
  postalCode: string | null
): string {
  const cityStateZip = [city, [state, postalCode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return [street, cityStateZip].filter(Boolean).join(", ");
}

// Best-effort reverse of formatAddress — used only to seed a pre-filled,
// borrower-editable field on the DSCR refinance conversion intake (see
// src/server/actions/deal-conversion.ts), never as an authoritative source,
// so an imperfect split on an unusual address is fine — the borrower
// reviews and can correct it before submitting.
export function parsePropertyAddress(formatted: string): {
  street: string;
  city: string;
  state: string;
  postalCode: string;
} {
  const [street = "", city = "", stateZip = ""] = formatted.split(", ").map((p) => p.trim());
  const lastSpace = stateZip.lastIndexOf(" ");
  const state = lastSpace >= 0 ? stateZip.slice(0, lastSpace) : stateZip;
  const postalCode = lastSpace >= 0 ? stateZip.slice(lastSpace + 1) : "";
  return { street, city, state, postalCode };
}
