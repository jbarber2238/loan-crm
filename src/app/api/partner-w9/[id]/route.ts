import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { referralAffiliates } from "@/server/db/schema";

// Admin-only: a signed W-9 holds a tax ID, so it's gated tighter than most documents.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !session.user.active || !session.user.isAdmin) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = await params;
  const partner = await db.query.referralAffiliates.findFirst({
    where: eq(referralAffiliates.id, id),
    columns: { w9PdfData: true, w9FileName: true },
  });
  if (!partner?.w9PdfData) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(Buffer.from(partner.w9PdfData, "base64")), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${(partner.w9FileName ?? "W-9.pdf").replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
