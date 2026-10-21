import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { dealFiles } from "@/server/db/schema";
import type { DealFileCategory, DealFileRow } from "@/lib/deal-files";

/** Every saved file on a deal (without the file bytes), newest first. */
export async function getDealFiles(dealId: string): Promise<DealFileRow[]> {
  const rows = await db.query.dealFiles.findMany({
    where: eq(dealFiles.dealId, dealId),
    columns: { id: true, category: true, fileName: true, fileSize: true, note: true, createdAt: true },
    with: { uploadedBy: { columns: { name: true } } },
    orderBy: (f, { desc }) => desc(f.createdAt),
  });
  return rows.map((r) => ({
    id: r.id,
    category: r.category as DealFileCategory,
    fileName: r.fileName,
    fileSize: r.fileSize,
    note: r.note,
    createdAt: r.createdAt,
    uploadedByName: r.uploadedBy?.name ?? null,
  }));
}
