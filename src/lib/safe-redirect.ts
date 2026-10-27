/**
 * A same-site path that is safe to send someone to after sign-in. Anything that
 * could leave the site (absolute URLs, //host, backslash tricks) is refused.
 */
export function safeCallbackPath(value: string | string[] | undefined): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\u0000-\u001f]/.test(value)) return null;
  return value;
}
