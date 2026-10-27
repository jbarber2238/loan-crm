"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { mcpOauthTokens } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { fail } from "@/lib/action-result";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Disconnects one connected app. Its access and refresh tokens stop working at once. */
export async function revokeMcpConnection(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("grantId") ?? "");
  if (!UUID.test(id)) return fail("That connection no longer exists.");
  await db.update(mcpOauthTokens).set({ revokedAt: new Date() }).where(and(eq(mcpOauthTokens.id, id), isNull(mcpOauthTokens.revokedAt)));
  revalidatePath("/settings/integrations");
}

/** The big red button: disconnects every connected app. */
export async function revokeAllMcpConnections() {
  await requireAdmin();
  await db.update(mcpOauthTokens).set({ revokedAt: new Date() }).where(isNull(mcpOauthTokens.revokedAt));
  revalidatePath("/settings/integrations");
}
