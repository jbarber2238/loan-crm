import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { clientNeeds } from "@/server/db/schema";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || !session.user.active) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const clientNeed = await db.query.clientNeeds.findFirst({
    where: eq(clientNeeds.id, id),
  });

  if (!clientNeed?.templateFileData || !clientNeed.templateFileMimeType || !clientNeed.templateFileName) {
    return new Response("Not found", { status: 404 });
  }

  const buffer = Buffer.from(clientNeed.templateFileData, "base64");

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": clientNeed.templateFileMimeType,
      "Content-Disposition": `inline; filename="${clientNeed.templateFileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
