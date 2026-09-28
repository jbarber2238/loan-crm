import { eq } from "drizzle-orm";
import convert from "heic-convert";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { dealClientNeedDocuments } from "@/server/db/schema";

const HEIC_TYPES = new Set(["image/heic", "image/heif"]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || !session.user.active) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const doc = await db.query.dealClientNeedDocuments.findFirst({
    where: eq(dealClientNeedDocuments.id, id),
  });

  if (!doc) {
    return new Response("Not found", { status: 404 });
  }

  let buffer = Buffer.from(doc.data, "base64");
  let mimeType = doc.mimeType;

  // No browser (other than Safari) can render HEIC/HEIF inline, so an <img>
  // or <iframe> pointed at the raw file falls back to just downloading it —
  // which looked like an unwanted surprise download when reviewing a client
  // need. Converting to JPEG on the fly lets it display like any other photo.
  if (HEIC_TYPES.has(mimeType.toLowerCase())) {
    try {
      buffer = Buffer.from(await convert({ buffer, format: "JPEG", quality: 0.85 }));
      mimeType = "image/jpeg";
    } catch (err) {
      console.error(`HEIC conversion failed for document ${id}, serving original bytes:`, err);
    }
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `inline; filename="${doc.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
