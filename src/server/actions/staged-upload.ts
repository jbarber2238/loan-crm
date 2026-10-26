"use server";

import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals, uploadChunks } from "@/server/db/schema";
import { auth } from "@/server/auth";
import { CHUNK_BYTES } from "@/lib/stage-large-files";
import { sweepStaleChunks } from "@/server/staged-uploads";

const MAX_CHUNKS = 14; // about 40MB, comfortably over the app's 15MB file limit

/**
 * Receives one piece of a large file. Allowed for signed-in staff, or for someone holding a valid
 * borrower upload link (they send their own documents without an account).
 */
export async function stageUploadChunk(formData: FormData): Promise<{ error: string } | { ok: true }> {
  const uploadId = String(formData.get("uploadId") ?? "");
  const index = Number(formData.get("index"));
  const chunks = Number(formData.get("chunks"));
  const chunk = formData.get("chunk");
  if (!/^[a-f0-9]{64}$/.test(uploadId) || !Number.isInteger(index) || !Number.isInteger(chunks)) return { error: "Bad upload." };
  if (index < 0 || chunks < 1 || chunks > MAX_CHUNKS || index >= chunks) return { error: "Bad upload." };
  if (!(chunk instanceof File) || chunk.size === 0 || chunk.size > CHUNK_BYTES + 1024) return { error: "Bad upload." };

  const session = await auth();
  const isStaff = Boolean(session?.user && session.user.active);
  if (!isStaff) {
    const token = String(formData.get("borrowerToken") ?? "");
    const deal = token ? await db.query.deals.findFirst({ where: eq(deals.borrowerUploadToken, token), columns: { id: true } }) : null;
    if (!deal) return { error: "This upload link isn't valid." };
  }

  await db
    .insert(uploadChunks)
    .values({ uploadId, chunkIndex: index, data: Buffer.from(await chunk.arrayBuffer()).toString("base64") })
    .onConflictDoUpdate({ target: [uploadChunks.uploadId, uploadChunks.chunkIndex], set: { data: Buffer.from(await chunk.arrayBuffer()).toString("base64") } });

  if (index === 0) await sweepStaleChunks();
  return { ok: true };
}
