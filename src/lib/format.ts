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
