import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { dealAppraisalDocuments, deals } from "@/server/db/schema";
import { contentDisposition } from "@/lib/content-disposition";

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
    columns: { appraisalDocumentFileName: true, appraisalDocumentMimeType: true },
  });
  const file = deal?.appraisalDocumentMimeType
    ? await db.query.dealAppraisalDocuments.findFirst({ where: eq(dealAppraisalDocuments.dealId, id), columns: { data: true } })
    : null;

  if (!deal || !file || !deal.appraisalDocumentMimeType) {
    return new Response("Not found", { status: 404 });
  }

  const buffer = Buffer.from(file.data, "base64");

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": deal.appraisalDocumentMimeType,
      "Content-Disposition": contentDisposition("inline", (deal.appraisalDocumentFileName ?? "appraisal")),
      "Cache-Control": "private, max-age=60",
    },
  });
}
