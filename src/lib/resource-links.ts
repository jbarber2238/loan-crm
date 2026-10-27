// Links an admin pins for the whole team (Google Drive docs, etc.), shown on My Profile under
// "Additional resources". The admin names each one; staff click the name to open it.

export const MAX_RESOURCE_TITLE_LENGTH = 120;

/**
 * Turns whatever was pasted into a safe web address: adds https:// when it was left off, and
 * returns null for anything that isn't a plain http(s) link (javascript:, data:, a bare word...).
 */
export function normalizeResourceUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw || /\s/.test(raw)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname.includes(".")) return null;
  return url.toString();
}
