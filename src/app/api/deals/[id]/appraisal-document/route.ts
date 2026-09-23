import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { deals } from "@/server/db/schema";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || !session.user.active) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, id),
    columns: { appraisalDocumentFileName: true, appraisalDocumentMimeType: true, appraisalDocumentData: true },
  });

  if (!deal?.appraisalDocumentData || !deal.appraisalDocumentMimeType) {
    return new Response("Not found", { status: 404 });
  }

  const buffer = Buffer.from(deal.appraisalDocumentData, "base64");

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": deal.appraisalDocumentMimeType,
      "Content-Disposition": `inline; filename="${(deal.appraisalDocumentFileName ?? "appraisal").replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
