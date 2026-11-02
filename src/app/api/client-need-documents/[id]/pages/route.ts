import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { dealClientNeedDocuments } from "@/server/db/schema";
import { pdfPageCount } from "@/server/lender-documents/extract-text";

// How many pages a PDF document has, so the phone viewer knows how many page images to ask for.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !session.user.active) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const doc = await db.query.dealClientNeedDocuments.findFirst({
    where: eq(dealClientNeedDocuments.id, id),
    columns: { data: true, mimeType: true, fileName: true },
  });
  if (!doc) return new Response("Not found", { status: 404 });
  if (doc.mimeType.toLowerCase() !== "application/pdf" && !/\.pdf$/i.test(doc.fileName)) return new Response("Not a PDF", { status: 415 });

  try {
    return Response.json({ pages: await pdfPageCount(doc.data) }, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (err) {
    console.error(`PDF page count failed for document ${id}:`, err);
    return Response.json({ pages: 0 }, { status: 200 });
  }
}
