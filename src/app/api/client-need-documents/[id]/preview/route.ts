import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { dealClientNeedDocuments } from "@/server/db/schema";
import { isSpreadsheet } from "@/lib/spreadsheet-preview";
import { renderSpreadsheetHtml } from "@/server/spreadsheet-html";

// A spreadsheet document as a web page of tables, for the client-need review window. Browsers download
// .xlsx files instead of showing them, so we draw the sheets ourselves.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !session.user.active) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const doc = await db.query.dealClientNeedDocuments.findFirst({ where: eq(dealClientNeedDocuments.id, id) });
  if (!doc) return new Response("Not found", { status: 404 });
  if (!isSpreadsheet(doc.mimeType, doc.fileName)) return new Response("Not a spreadsheet", { status: 415 });

  let html: string;
  try {
    html = await renderSpreadsheetHtml(Buffer.from(doc.data, "base64"), doc.fileName);
  } catch (err) {
    console.error(`Spreadsheet preview failed for document ${id}:`, err);
    html = await renderSpreadsheetHtml(null, doc.fileName);
  }

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // The page is only tables and styling: no scripts, nothing loaded from anywhere, and a spreadsheet's own
      // contents can't run code even if they look like it.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'self'",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=60",
    },
  });
}
