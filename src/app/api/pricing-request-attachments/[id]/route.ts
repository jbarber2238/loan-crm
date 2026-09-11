import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { pricingRequestReplyAttachments } from "@/server/db/schema";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || !session.user.active) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const attachment = await db.query.pricingRequestReplyAttachments.findFirst({
    where: eq(pricingRequestReplyAttachments.id, id),
  });

  if (!attachment) {
    return new Response("Not found", { status: 404 });
  }

  const buffer = Buffer.from(attachment.data, "base64");

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `inline; filename="${attachment.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
