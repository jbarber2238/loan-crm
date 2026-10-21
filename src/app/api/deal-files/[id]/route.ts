import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { dealFiles } from "@/server/db/schema";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !session.user.active) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });
  const file = await db.query.dealFiles.findFirst({ where: eq(dealFiles.id, id) });
  if (!file) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(Buffer.from(file.data, "base64")), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Disposition": `inline; filename="${file.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
