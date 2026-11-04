// Reads that land on a dead pooled connection don't fail fast: the socket looks open, the query is sent, and
// nothing ever comes back until the retired pool is torn down a minute later ("write CONNECTION_DESTROYED"),
// which the person sees as a full-page "This page couldn't load" after a long hang. A normal read here takes well
// under a second, so one that is still unanswered after a few seconds is almost certainly on a dead connection.
// Reads are safe to run twice, so they get one more try on a fresh connection; the caller supplies the swap.

export const READ_ATTEMPT_MS = 12_000;

const CONNECTION_ERROR_CODES = new Set([
  "CONNECTION_DESTROYED",
  "CONNECTION_CLOSED",
  "CONNECTION_ENDED",
  "CONNECT_TIMEOUT",
  "ECONNRESET",
  "EPIPE",
]);

export class StuckQueryError extends Error {
  code = "QUERY_STUCK";
  constructor() {
    super("The database didn't answer in time");
  }
}

/** True for the errors a dead or recycled connection produces, wherever the driver or drizzle put the code. */
export function isConnectionError(err: unknown): boolean {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null | undefined;
  const code = e?.code ?? e?.cause?.code;
  return typeof code === "string" && CONNECTION_ERROR_CODES.has(code);
}

/** Only plain reads: a write that died mid-flight may or may not have been applied, so it is never repeated. */
export function isRetryableRead(query: string): boolean {
  return /^\s*select\b/i.test(query) && !/\bfor\s+(update|share|no\s+key\s+update|key\s+share)\b/i.test(query);
}

function withDeadline<T>(work: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new StuckQueryError()), ms);
    // A late result from the abandoned attempt lands here and is ignored, so it can't surface as an unhandled rejection.
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * Runs `attempt`; if it stalls past `attemptMs` or fails on a dead connection, calls `onRetry` (which should swap in
 * a fresh connection pool) and runs `attempt` once more. Any other error is the query's own and goes straight through.
 */
export async function runReadWithRetry<T>(
  attempt: () => PromiseLike<T>,
  onRetry: () => void,
  attemptMs: number = READ_ATTEMPT_MS
): Promise<T> {
  try {
    return await withDeadline(attempt(), attemptMs);
  } catch (err) {
    if (!(err instanceof StuckQueryError) && !isConnectionError(err)) throw err;
    onRetry();
    return await attempt();
  }
}
