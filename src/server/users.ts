import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";

/** The sending user's own signature, appended below the body of every email they send. */
export async function getUserEmailSignatureHtml(userId: string): Promise<string> {
  const row = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { emailSignatureHtml: true },
  });
  return row?.emailSignatureHtml ?? "";
}
