"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/server/db/client";
import { leadTags, marketingAudiences } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { loadEligiblePeople } from "@/server/marketing-audience";
import { applyFilters, normalizeTag, type AudienceFilters } from "@/lib/marketing-audience";

type Result<T = object> = ({ ok: true } & T) | { error: string };

const strings = z.array(z.string().max(80)).max(50);
const filtersSchema = z.object({
  sources: strings,
  roles: strings,
  statuses: strings,
  friday: strings,
  partner: z.enum(["any", "signed", "not_signed"]),
  becameDeal: z.enum(["any", "yes", "no"]),
  tags: strings,
  joinedFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  joinedTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  search: z.string().max(100),
});

function parseFilters(raw: unknown): AudienceFilters | null {
  const parsed = filtersSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function refresh() {
  revalidatePath("/marketing/audiences");
}

async function insertTags(leadIds: string[], tag: string, userId: string) {
  if (leadIds.length === 0) return;
  await db.insert(leadTags).values(leadIds.map((leadId) => ({ leadId, tag, createdByUserId: userId }))).onConflictDoNothing();
}

/** Tags everyone the filters match right now. The match is worked out here, never trusted from the browser. */
export async function tagMatchingPeople(rawFilters: unknown, rawTag: string): Promise<Result<{ count: number }>> {
  const user = await requireAdmin();
  const filters = parseFilters(rawFilters);
  const tag = normalizeTag(rawTag);
  if (!filters) return { error: "Those filters couldn't be read. Refresh and try again." };
  if (!tag) return { error: "Tags are 2 to 40 letters, numbers, spaces or dashes." };
  const people = applyFilters(await loadEligiblePeople(), filters);
  await insertTags(people.map((p) => p.id), tag, user.id);
  refresh();
  return { ok: true, count: people.length };
}

/** Tags one person. */
export async function tagPerson(leadId: string, rawTag: string): Promise<Result> {
  const user = await requireAdmin();
  const tag = normalizeTag(rawTag);
  if (!tag) return { error: "Tags are 2 to 40 letters, numbers, spaces or dashes." };
  const people = await loadEligiblePeople();
  if (!people.some((p) => p.id === leadId)) return { error: "That person isn't on the eligible list." };
  await insertTags([leadId], tag, user.id);
  refresh();
  return { ok: true };
}

export async function removeTag(leadId: string, tag: string): Promise<Result> {
  await requireAdmin();
  await db.delete(leadTags).where(and(eq(leadTags.leadId, leadId), eq(leadTags.tag, tag)));
  refresh();
  return { ok: true };
}

export async function saveAudience(rawName: string, rawFilters: unknown): Promise<Result> {
  const user = await requireAdmin();
  const name = rawName.trim();
  const filters = parseFilters(rawFilters);
  if (name.length < 2 || name.length > 80) return { error: "Give the audience a name (2 to 80 characters)." };
  if (!filters) return { error: "Those filters couldn't be read. Refresh and try again." };
  await db.insert(marketingAudiences).values({ name, filters, createdByUserId: user.id });
  refresh();
  return { ok: true };
}

export async function deleteAudience(id: string): Promise<Result> {
  await requireAdmin();
  await db.delete(marketingAudiences).where(eq(marketingAudiences.id, id));
  refresh();
  return { ok: true };
}
