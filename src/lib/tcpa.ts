/**
 * TCPA's own "reasonable hours" safe-harbor window — 8am to 9pm, in the
 * recipient's local time — is the absolute outer bound for any outbound
 * call or text to a borrower. Nothing in this app can be configured wider
 * than this: not the org-wide ceiling (Settings → Phone), and not a
 * person's own outbound hours within it (My Profile). Inbound hours have
 * no such rule — a borrower calling in is never a TCPA concern — so this
 * only ever gates outbound.
 */
export const TCPA_ABSOLUTE_START = "08:00";
export const TCPA_ABSOLUTE_END = "21:00";

/** "HH:MM" (or "HH:MM:SS") string comparison — safe because both are zero-padded 24h time. */
export function timeAtOrAfter(a: string, b: string): boolean {
  return a.slice(0, 5) >= b.slice(0, 5);
}

export function timeAtOrBefore(a: string, b: string): boolean {
  return a.slice(0, 5) <= b.slice(0, 5);
}
