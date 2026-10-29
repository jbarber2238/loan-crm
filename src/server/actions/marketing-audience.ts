"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { marketingContactTags, marketingContacts } from "@/server/db/schema";
import { recordAgreedConsent } from "@/server/marketing-consent";
import { requireAdmin } from "@/server/auth/guards";
import { loadAllPeople } from "@/server/marketing-audience";
import { emailKey, isPlausibleEmail, normalizeTag, type AudiencePerson } from "@/lib/marketing-audience";

type Result<T = object> = ({ ok: true } & T) | { error: string };

const MAX_PEOPLE_PER_ACTION = 1000;

function refresh() {
  revalidatePath("/marketing/audiences");
  revalidatePath("/marketing");
}

/** The people these emails belong to, from the live list. Anything not found is ignored. */
async function findPeople(emails: string[]): Promise<AudiencePerson[]> {
  const wanted = new Set(emails.slice(0, MAX_PEOPLE_PER_ACTION).map(emailKey));
  return (await loadAllPeople()).filter((p) => wanted.has(p.key));
}

/** Records that these people told you they're OK with marketing emails. */
export async function markAgreed(emails: string[], rawNote: string): Promise<Result<{ recorded: number; skipped: number }>> {
  const user = await requireAdmin();
  const note = rawNote.trim().slice(0, 200) || null;
  const people = await findPeople(emails);
  if (people.length === 0) return { error: "Nobody selected." };
  let recorded = 0;
  let skipped = 0;
  for (const p of people) {
    const outcome = await recordAgreedConsent({ email: p.key, name: p.name, phone: p.phone, source: "staff", note, userId: user.id });
    if (outcome === "recorded") recorded++;
    else if (outcome === "unsubscribed") skipped++;
  }
  refresh();
  return { ok: true, recorded, skipped };
}

/** Takes people off every marketing list. They can be put back with Mark as agreed. */
export async function removeFromMarketing(emails: string[]): Promise<Result<{ count: number }>> {
  const user = await requireAdmin();
  const people = await findPeople(emails);
  if (people.length === 0) return { error: "Nobody selected." };
  for (const p of people) {
    await db
      .insert(marketingContacts)
      .values({ email: p.key, name: p.name, phone: p.phone, unsubscribedAt: new Date(), unsubscribeSource: "staff", createdByUserId: user.id })
      .onConflictDoUpdate({ target: marketingContacts.email, set: { unsubscribedAt: new Date(), unsubscribeSource: "staff" } });
  }
  refresh();
  return { ok: true, count: people.length };
}

/** Adds one person by hand: name and email required, phone optional, and whether they agreed to marketing. */
export async function addContact(input: { name: string; email: string; phone: string; agreed: boolean; tag: string }): Promise<Result> {
  const user = await requireAdmin();
  const name = input.name.trim();
  const email = emailKey(input.email);
  if (!name) return { error: "Add a name." };
  if (!isPlausibleEmail(email)) return { error: "That email address doesn't look right." };
  const tag = input.tag.trim() ? normalizeTag(input.tag) : null;
  if (input.tag.trim() && !tag) return { error: "Tags are 2 to 40 letters, numbers, spaces or dashes." };

  const existing = (await loadAllPeople()).find((p) => p.key === email);
  const knownElsewhere = existing && (existing.isLead || existing.closedDeals + existing.openDeals > 0 || existing.partner);
  if (existing?.consent === "unsubscribed" && input.agreed) return { error: "That person unsubscribed. They can't be added back." };

  await db
    .insert(marketingContacts)
    .values({
      email,
      name,
      phone: input.phone.trim(),
      addedManually: !knownElsewhere,
      marketingConsent: input.agreed,
      consentSource: input.agreed ? "manual" : null,
      consentAt: input.agreed ? new Date() : null,
      createdByUserId: user.id,
    })
    .onConflictDoNothing();
  if (existing && input.agreed && existing.consent === "not_agreed") await recordAgreedConsent({ email, name, phone: input.phone.trim(), source: "manual", note: null, userId: user.id });
  if (tag) await db.insert(marketingContactTags).values({ email, tag, createdByUserId: user.id }).onConflictDoNothing();
  refresh();
  return { ok: true };
}

/** Tags these people. */
export async function tagPeople(emails: string[], rawTag: string): Promise<Result<{ count: number }>> {
  const user = await requireAdmin();
  const tag = normalizeTag(rawTag);
  if (!tag) return { error: "Tags are 2 to 40 letters, numbers, spaces or dashes." };
  const people = await findPeople(emails);
  if (people.length === 0) return { error: "Nobody selected." };
  await db
    .insert(marketingContactTags)
    .values(people.map((p) => ({ email: p.key, tag, createdByUserId: user.id })))
    .onConflictDoNothing();
  refresh();
  return { ok: true, count: people.length };
}

export async function removeTag(email: string, tag: string): Promise<Result> {
  await requireAdmin();
  await db.delete(marketingContactTags).where(and(eq(marketingContactTags.email, emailKey(email)), eq(marketingContactTags.tag, tag)));
  refresh();
  return { ok: true };
}

/** Deletes a person who was added by hand (and nothing else): the list entry, their tags. Never touches a lead, borrower or partner. */
export async function deleteManualContact(email: string): Promise<Result> {
  await requireAdmin();
  const key = emailKey(email);
  const person = (await loadAllPeople()).find((p) => p.key === key);
  if (!person || !person.addedManually || person.isLead || person.closedDeals + person.openDeals > 0 || person.partner) {
    return { error: "Only people added by hand can be deleted." };
  }
  // An opt-out has to outlive the person, or adding them again would quietly bring them back.
  if (person.consent === "unsubscribed") return { error: "They unsubscribed, so we keep the record." };
  await db.delete(marketingContactTags).where(inArray(marketingContactTags.email, [key]));
  await db.delete(marketingContacts).where(eq(marketingContacts.email, key));
  refresh();
  return { ok: true };
}
