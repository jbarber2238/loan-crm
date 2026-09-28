import JSZip from "jszip";
import { inArray } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { dealClientNeedDocuments } from "@/server/db/schema";

/**
 * Bundles the given document ids into one zip — used by the Documents tab's
 * "Download selected" / "Download all" buttons so a multi-file selection is
 * one download instead of triggering N separate ones (which browsers throttle
 * or block past a handful).
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || !session.user.active) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids.filter((v: unknown) => typeof v === "string") : [];
  if (!ids.length) return new Response("No documents selected", { status: 400 });

  const docs = await db.query.dealClientNeedDocuments.findMany({
    where: inArray(dealClientNeedDocuments.id, ids),
    columns: { fileName: true, data: true },
  });
  if (!docs.length) return new Response("No matching documents", { status: 404 });

  const zip = new JSZip();
  // Duplicate names (e.g. two needs each with a file called "Statement.pdf")
  // get a numeric suffix so nothing silently overwrites another entry.
  const usedNames = new Map<string, number>();
  for (const doc of docs) {
    let name = doc.fileName || "document";
    const count = usedNames.get(name) ?? 0;
    usedNames.set(name, count + 1);
    if (count > 0) {
      const dot = name.lastIndexOf(".");
      name = dot > 0 ? `${name.slice(0, dot)} (${count})${name.slice(dot)}` : `${name} (${count})`;
    }
    zip.file(name, Buffer.from(doc.data, "base64"));
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const zipName = typeof body?.zipName === "string" && body.zipName.trim() ? body.zipName.trim() : "documents";

  return new Response(new Uint8Array(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName.replace(/[".]/g, "")}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
