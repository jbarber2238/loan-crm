import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { dealClientNeedDocuments } from "@/server/db/schema";
import { renderPdfPageJpeg } from "@/server/lender-documents/extract-text";

// One page of a PDF document as a picture. Phones show these stacked, because an iPhone's built-in PDF frame
// shows only the first page and can't be scrolled properly.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; page: string }> }) {
  const session = await auth();
  if (!session?.user || !session.user.active) return new Response("Unauthorized", { status: 401 });

  const { id, page } = await params;
  const pageNumber = Number(page);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 500) return new Response("Bad page", { status: 400 });

  const doc = await db.query.dealClientNeedDocuments.findFirst({
    where: eq(dealClientNeedDocuments.id, id),
    columns: { data: true, mimeType: true, fileName: true },
  });
  if (!doc) return new Response("Not found", { status: 404 });
  if (doc.mimeType.toLowerCase() !== "application/pdf" && !/\.pdf$/i.test(doc.fileName)) return new Response("Not a PDF", { status: 415 });

  try {
    const jpeg = await renderPdfPageJpeg(doc.data, pageNumber);
    if (!jpeg) return new Response("No such page", { status: 404 });
    return new Response(new Uint8Array(jpeg), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" } });
  } catch (err) {
    console.error(`PDF page ${pageNumber} render failed for document ${id}:`, err);
    return new Response("Couldn't render that page", { status: 500 });
  }
}
