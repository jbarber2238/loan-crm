import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { affiliatePaymentDocuments } from "@/server/db/schema";

// Admin-only, unlike most other document downloads in this app — this is
// someone's bank/wire routing info, not a lender doc, so gated tighter than
// "any active staff member."
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || !session.user.active || !session.user.isAdmin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const doc = await db.query.affiliatePaymentDocuments.findFirst({
    where: eq(affiliatePaymentDocuments.id, id),
  });

  if (!doc) {
    return new Response("Not found", { status: 404 });
  }

  const buffer = Buffer.from(doc.data, "base64");

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `attachment; filename="${doc.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
