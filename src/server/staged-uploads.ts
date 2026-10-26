import { and, eq, lt, asc } from "drizzle-orm";
import { db } from "@/server/db/client";
import { uploadChunks } from "@/server/db/schema";
import { isStagedMarker, parseStagedMarker } from "@/lib/stage-large-files";

const MAX_STAGED_BYTES = 40 * 1024 * 1024;
const STALE_AFTER_MS = 60 * 60 * 1000;

/** Removes pieces nobody claimed (an upload that was abandoned halfway). */
export async function sweepStaleChunks(): Promise<void> {
  await db.delete(uploadChunks).where(lt(uploadChunks.createdAt, new Date(Date.now() - STALE_AFTER_MS)));
}

/**
 * Call first thing in any action that receives uploaded files. Any file the browser staged in pieces
 * (see stageLargeFiles) is put back together and put into the form as a normal File, so the rest of the
 * action never knows the difference. Forms with no staged files are left exactly as they are.
 */
export async function resolveStagedFiles(formData: FormData): Promise<void> {
  const entries = [...formData.entries()];
  if (!entries.some(([, v]) => isStagedMarker(v))) return;

  const resolved: [string, FormDataEntryValue][] = [];
  for (const [key, value] of entries) {
    if (!isStagedMarker(value)) {
      resolved.push([key, value]);
      continue;
    }
    const marker = parseStagedMarker(value);
    if (!marker) throw new Error("That upload couldn't be read. Please try again.");
    const rows = await db
      .select({ i: uploadChunks.chunkIndex, data: uploadChunks.data })
      .from(uploadChunks)
      .where(eq(uploadChunks.uploadId, marker.id))
      .orderBy(asc(uploadChunks.chunkIndex));
    if (rows.length !== marker.chunks || rows.some((r, n) => r.i !== n)) {
      throw new Error(`${marker.name} didn't finish uploading. Please try again.`);
    }
    const buffer = Buffer.concat(rows.map((r) => Buffer.from(r.data, "base64")));
    if (buffer.length !== marker.size || buffer.length > MAX_STAGED_BYTES) {
      throw new Error(`${marker.name} didn't upload correctly. Please try again.`);
    }
    await db.delete(uploadChunks).where(and(eq(uploadChunks.uploadId, marker.id)));
    resolved.push([key, new File([new Uint8Array(buffer)], marker.name, { type: marker.type })]);
  }

  for (const key of new Set(entries.map(([k]) => k))) formData.delete(key);
  for (const [key, value] of resolved) formData.append(key, value);
}
