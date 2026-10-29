"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { followUpContacts, followUpTouches, marketingContacts } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { recordAgreedConsent } from "@/server/marketing-consent";
import { emailKey, isPlausibleEmail } from "@/lib/marketing-audience";
import { daysUntilNext, dueOnDay, isCadence, nextDueAt, type FollowUpCadence } from "@/lib/follow-up-schedule";
import { addDays, etDay } from "@/lib/friday-schedule";

type Result<T = object> = ({ ok: true } & T) | { error: string };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CHANNELS = ["call", "text", "email", "in_person", "other"];

function refresh() {
  revalidatePath("/marketing/follow-ups");
  revalidatePath("/marketing/audiences");
}

interface ContactFields {
  name: string;
  email: string;
  phone: string;
  notes: string;
  cadence: string;
}

function checkFields(f: ContactFields): { error: string } | { name: string; email: string | null; phone: string | null; notes: string | null; cadence: FollowUpCadence } {
  const name = f.name.trim();
  const email = f.email.trim() ? emailKey(f.email) : null;
  const phone = f.phone.trim() || null;
  if (!name) return { error: "Add a name." };
  if (!email && !phone) return { error: "Add a phone number or an email so you can reach them." };
  if (email && !isPlausibleEmail(email)) return { error: "That email address doesn't look right." };
  if (!isCadence(f.cadence)) return { error: "Pick how often to be reminded." };
  return { name, email, phone, notes: f.notes.trim().slice(0, 500) || null, cadence: f.cadence };
}

/** Puts someone's marketing agreement in line with the switch on their follow-up card. */
async function syncMarketing(c: { email: string | null; name: string; phone: string | null }, ok: boolean, userId: string): Promise<string | null> {
  if (!c.email) return ok ? "Add an email address first: marketing goes out by email." : null;
  if (ok) {
    const outcome = await recordAgreedConsent({ email: c.email, name: c.name, phone: c.phone ?? "", source: "follow_up", note: null, userId });
    return outcome === "unsubscribed" ? "They unsubscribed themselves, so they can't be put back on the marketing list." : null;
  }
  // Only take back an agreement this assistant recorded; never touch consent they gave on a form.
  const contact = await db.query.marketingContacts.findFirst({ where: eq(marketingContacts.email, emailKey(c.email)) });
  if (contact?.marketingConsent && contact.consentSource === "follow_up") {
    await db.update(marketingContacts).set({ marketingConsent: false }).where(eq(marketingContacts.id, contact.id));
  }
  return null;
}

export async function addFollowUp(input: ContactFields & { marketingOk: boolean; firstDay: string | null }): Promise<Result> {
  const user = await requireAdmin();
  const f = checkFields(input);
  if ("error" in f) return f;
  if (input.firstDay && !DAY_RE.test(input.firstDay)) return { error: "That reminder date doesn't look right." };
  const now = new Date();
  const next = input.firstDay ? dueOnDay(input.firstDay) : nextDueAt(f.cadence, 0, now);
  const problem = input.marketingOk ? await syncMarketing(f, true, user.id) : null;
  if (problem) return { error: problem };
  await db.insert(followUpContacts).values({
    name: f.name,
    email: f.email,
    phone: f.phone,
    notes: f.notes,
    cadence: f.cadence,
    marketingOk: input.marketingOk,
    nextFollowUpAt: next,
    ownerUserId: user.id,
  });
  refresh();
  return { ok: true };
}

export async function updateFollowUp(id: string, input: ContactFields): Promise<Result> {
  const user = await requireAdmin();
  const f = checkFields(input);
  if ("error" in f) return f;
  const existing = await db.query.followUpContacts.findFirst({ where: eq(followUpContacts.id, id) });
  if (!existing) return { error: "That follow-up no longer exists." };
  if (existing.marketingOk) {
    const problem = await syncMarketing(f, true, user.id);
    if (problem) return { error: problem };
  }
  await db.update(followUpContacts).set({ name: f.name, email: f.email, phone: f.phone, notes: f.notes, cadence: f.cadence }).where(eq(followUpContacts.id, id));
  refresh();
  return { ok: true };
}

/** Logs that you followed up, and sets the next reminder from their schedule (or a day you pick). */
export async function logFollowUp(id: string, input: { channel: string; note: string; nextDay: string | null }): Promise<Result<{ nextDay: string }>> {
  const user = await requireAdmin();
  const c = await db.query.followUpContacts.findFirst({ where: eq(followUpContacts.id, id) });
  if (!c) return { error: "That follow-up no longer exists." };
  if (input.nextDay && !DAY_RE.test(input.nextDay)) return { error: "That date doesn't look right." };
  const channel = CHANNELS.includes(input.channel) ? input.channel : "other";
  const now = new Date();
  const done = c.touchCount + 1;
  const cadence = isCadence(c.cadence) ? c.cadence : "smart";
  const next = input.nextDay ? dueOnDay(input.nextDay) : nextDueAt(cadence, done, now);
  await db.insert(followUpTouches).values({ contactId: id, channel, note: input.note.trim().slice(0, 500) || null, userId: user.id });
  await db
    .update(followUpContacts)
    .set({ touchCount: done, lastFollowedUpAt: now, nextFollowUpAt: next, remindedAt: null, status: "active" })
    .where(eq(followUpContacts.id, id));
  refresh();
  return { ok: true, nextDay: etDay(next) };
}

export async function snoozeFollowUp(id: string, days: number): Promise<Result> {
  await requireAdmin();
  if (!Number.isInteger(days) || days < 1 || days > 365) return { error: "Pick between 1 and 365 days." };
  await db
    .update(followUpContacts)
    .set({ nextFollowUpAt: dueOnDay(addDays(etDay(new Date()), days)), remindedAt: null })
    .where(eq(followUpContacts.id, id));
  refresh();
  return { ok: true };
}

export async function setFollowUpMarketing(id: string, ok: boolean): Promise<Result> {
  const user = await requireAdmin();
  const c = await db.query.followUpContacts.findFirst({ where: eq(followUpContacts.id, id) });
  if (!c) return { error: "That follow-up no longer exists." };
  const problem = await syncMarketing(c, ok, user.id);
  if (problem) return { error: problem };
  await db.update(followUpContacts).set({ marketingOk: ok }).where(eq(followUpContacts.id, id));
  refresh();
  return { ok: true };
}

export async function stopFollowUp(id: string): Promise<Result> {
  await requireAdmin();
  await db.update(followUpContacts).set({ status: "stopped", nextFollowUpAt: null }).where(eq(followUpContacts.id, id));
  refresh();
  return { ok: true };
}

export async function resumeFollowUp(id: string): Promise<Result> {
  await requireAdmin();
  const c = await db.query.followUpContacts.findFirst({ where: eq(followUpContacts.id, id) });
  if (!c) return { error: "That follow-up no longer exists." };
  const cadence = isCadence(c.cadence) ? c.cadence : "smart";
  const next = dueOnDay(addDays(etDay(new Date()), daysUntilNext(cadence, c.touchCount)));
  await db.update(followUpContacts).set({ status: "active", nextFollowUpAt: next, remindedAt: null }).where(eq(followUpContacts.id, id));
  refresh();
  return { ok: true };
}

export async function deleteFollowUp(id: string): Promise<Result> {
  await requireAdmin();
  await db.delete(followUpContacts).where(eq(followUpContacts.id, id));
  refresh();
  return { ok: true };
}
