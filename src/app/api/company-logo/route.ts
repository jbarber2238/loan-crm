import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { companySettings } from "@/server/db/schema";

// No auth — this has to be fetchable by email clients (Gmail, Outlook, etc.)
// rendering the logo <img> tag in an email neither of us is logged into.
// Nothing sensitive lives here, just the uploaded logo image.
export async function GET() {
  const row = await db.query.companySettings.findFirst({
    where: eq(companySettings.id, "default"),
  });

  if (!row?.logoData || !row.logoMimeType) {
    return new Response("Not found", { status: 404 });
  }

  const buffer = Buffer.from(row.logoData, "base64");

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": row.logoMimeType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
