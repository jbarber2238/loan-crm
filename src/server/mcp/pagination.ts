export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export interface Page<T> {
  items: T[];
  total: number;
  /** Pass back as `cursor` to get the next page; null on the last page. */
  next_cursor: string | null;
}

export function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset }), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as { o?: unknown };
    const offset = parsed.o;
    if (typeof offset === "number" && Number.isInteger(offset) && offset >= 0 && offset <= 100_000) return offset;
  } catch {
    // fall through
  }
  throw new McpInputError("cursor is not valid. Use the next_cursor value from a previous result, or omit it.");
}

export function clampLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_PAGE_SIZE);
}

/** Where a page starts and how long it is, after validating the cursor. */
export function pageWindow(limit: number | undefined, cursor: string | undefined): { offset: number; size: number } {
  return { offset: decodeCursor(cursor), size: clampLimit(limit) };
}

export function paginate<T>(all: T[], limit: number | undefined, cursor: string | undefined): Page<T> {
  const { offset, size } = pageWindow(limit, cursor);
  const items = all.slice(offset, offset + size);
  const next = offset + size;
  return { items, total: all.length, next_cursor: next < all.length ? encodeCursor(next) : null };
}

/** A problem with what the caller asked for (as opposed to a server fault). */
export class McpInputError extends Error {}
