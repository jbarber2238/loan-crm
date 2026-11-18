"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { parsePipelineScope, parsePipelineSort, parsePipelineView, type PipelineScope, type PipelineSort, type PipelineView } from "@/lib/pipeline-list";

/** Saves how this person likes the Pipeline page (board or list, all or mine, list sort) so it opens that way next time. */
export async function savePipelinePrefs(prefs: { view?: PipelineView; scope?: PipelineScope; sort?: PipelineSort }) {
  const user = await requireUser();
  const patch: Partial<typeof users.$inferInsert> = {};
  if (prefs.view !== undefined) patch.pipelineView = parsePipelineView(prefs.view);
  if (prefs.scope !== undefined) patch.pipelineScope = parsePipelineScope(prefs.scope);
  if (prefs.sort !== undefined) patch.pipelineSort = parsePipelineSort(prefs.sort);
  if (!Object.keys(patch).length) return;
  await db.update(users).set(patch).where(eq(users.id, user.id));
  revalidatePath("/pipeline");
}
