import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { termSheets } from "@/server/db/schema";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || !session.user.active) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const termSheet = await db.query.termSheets.findFirst({
    where: eq(termSheets.id, id),
    columns: { signedDocumentFileName: true, signedDocumentMimeType: true, signedDocumentData: true },
  });

  if (!termSheet?.signedDocumentData || !termSheet.signedDocumentMimeType) {
    return new Response("Not found", { status: 404 });
  }

  const buffer = Buffer.from(termSheet.signedDocumentData, "base64");

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": termSheet.signedDocumentMimeType,
      "Content-Disposition": `inline; filename="${(termSheet.signedDocumentFileName ?? "signed-term-sheet.pdf").replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
