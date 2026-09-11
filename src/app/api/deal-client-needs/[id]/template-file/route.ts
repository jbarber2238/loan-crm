import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { dealClientNeeds } from "@/server/db/schema";

// No auth check — this is reachable from the token-gated borrower-upload
// page, which never has a session. Safe because it only ever serves a
// blank, non-sensitive template file by unguessable UUID id, never anything
// the borrower has submitted.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const need = await db.query.dealClientNeeds.findFirst({
    where: eq(dealClientNeeds.id, id),
  });

  if (!need?.templateFileData || !need.templateFileMimeType || !need.templateFileName) {
    return new Response("Not found", { status: 404 });
  }

  const buffer = Buffer.from(need.templateFileData, "base64");

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": need.templateFileMimeType,
      "Content-Disposition": `inline; filename="${need.templateFileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
