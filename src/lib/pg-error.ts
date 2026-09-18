/**
 * Drizzle's postgres-js driver wraps every query failure in its own
 * DrizzleQueryError, with the real Postgres error (the one that actually
 * has `.code`, e.g. "23503" for a foreign-key violation) nested one level
 * down at `.cause` — not on the error itself. Checking `err.code` directly
 * silently never matches, which is exactly what happened here: catch
 * blocks written to turn a foreign-key violation into a friendly message
 * were falling through to `throw err` every time, surfacing the raw
 * DrizzleQueryError (a huge message with the full failed SQL and params
 * embedded) instead — which is large/unusual enough to break Next.js's
 * Server Action error serialization and show up as a bare, unhelpful
 * "Minified React error #441" instead of either message.
 */
export function isPgErrorCode(err: unknown, code: string): boolean {
  if (!err || typeof err !== "object") return false;
  if ("code" in err && err.code === code) return true;
  const cause = "cause" in err ? err.cause : undefined;
  return Boolean(cause && typeof cause === "object" && "code" in cause && cause.code === code);
}
