// Vercel rejects any single request over ~4.5MB, and a Next server action receives its files in one
// request, so a 6MB appraisal fails with "An unexpected response was received from the server".
// stageLargeFiles() runs in the browser first: when a form's files add up to more than a safe size, each
// big file is sent in small pieces ahead of time and the form carries a short marker in its place.
// resolveStagedFiles() (src/server/staged-uploads.ts) swaps the real file back in on the server.

/** Total file bytes a single request can carry comfortably (the hard limit is about 4.5MB). */
export const INLINE_LIMIT_BYTES = 3 * 1024 * 1024;
/** Size of each piece. Under the limit with room for the form's other fields. */
export const CHUNK_BYTES = 3 * 1024 * 1024;
/** Files this small stay in the form even when others are staged. */
const STAY_INLINE_BYTES = 256 * 1024;

export const STAGED_PREFIX = "__staged:";

export interface StagedMarker {
  id: string;
  name: string;
  type: string;
  size: number;
  chunks: number;
}

export function isStagedMarker(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(STAGED_PREFIX);
}

export function parseStagedMarker(value: string): StagedMarker | null {
  try {
    const m = JSON.parse(value.slice(STAGED_PREFIX.length)) as StagedMarker;
    return typeof m.id === "string" && typeof m.name === "string" && Number.isInteger(m.chunks) ? m : null;
  } catch {
    return null;
  }
}

/** How many pieces a file of this size needs. */
export function chunkCount(size: number): number {
  return Math.max(1, Math.ceil(size / CHUNK_BYTES));
}

type StageChunk = (formData: FormData) => Promise<{ error: string } | { ok: true }>;

/**
 * Returns a copy of the form that is safe to send: if its files add up to more than the inline limit,
 * the larger ones are uploaded in pieces first and replaced by markers. A form that's already small is
 * returned as it is, so ordinary uploads behave exactly as before.
 *
 * `auth` is how a visitor with no account proves they may upload: the borrower upload link's token.
 */
export async function stageLargeFiles(
  formData: FormData,
  stageChunk: StageChunk,
  auth?: { borrowerToken?: string }
): Promise<FormData> {
  const files = [...formData.entries()].filter((e): e is [string, File] => e[1] instanceof File);
  const total = files.reduce((n, [, f]) => n + f.size, 0);
  if (total <= INLINE_LIMIT_BYTES) return formData;

  const out = new FormData();
  for (const [key, value] of formData.entries()) {
    if (!(value instanceof File) || value.size <= STAY_INLINE_BYTES) {
      out.append(key, value);
      continue;
    }
    const id = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const chunks = chunkCount(value.size);
    for (let i = 0; i < chunks; i++) {
      const part = new FormData();
      part.set("uploadId", id);
      part.set("index", String(i));
      part.set("chunks", String(chunks));
      if (auth?.borrowerToken) part.set("borrowerToken", auth.borrowerToken);
      part.set("chunk", value.slice(i * CHUNK_BYTES, (i + 1) * CHUNK_BYTES));
      const result = await stageChunk(part);
      if ("error" in result) throw new Error(result.error);
    }
    const marker: StagedMarker = { id, name: value.name, type: value.type, size: value.size, chunks };
    out.append(key, STAGED_PREFIX + JSON.stringify(marker));
  }
  return out;
}
