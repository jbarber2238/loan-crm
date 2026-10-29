import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { companySettings } from "@/server/db/schema";
import { contentDisposition } from "@/lib/content-disposition";

// Signed-in staff only (it holds bank details), unlike the public company logo.
export async function GET() {
  const session = await auth();
  if (!session?.user || !session.user.active) return new Response("Unauthorized", { status: 401 });

  const row = await db.query.companySettings.findFirst({
    where: eq(companySettings.id, "default"),
    columns: { wireInstructionsFileName: true, wireInstructionsMimeType: true, wireInstructionsData: true },
  });
  if (!row?.wireInstructionsData) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(Buffer.from(row.wireInstructionsData, "base64")), {
    headers: {
      "Content-Type": row.wireInstructionsMimeType ?? "application/octet-stream",
      "Content-Disposition": contentDisposition("inline", (row.wireInstructionsFileName ?? "wire-instructions")),
      "Cache-Control": "private, no-store",
    },
  });
}
