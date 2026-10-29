import { and, desc, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { db } from "@/server/db/client";
import { followUpContacts, followUpTouches, users } from "@/server/db/schema";
import { createNotifications } from "@/server/notifications";
import { sendGmailAs } from "@/server/gmail/send";
import { sender } from "@/server/friday";
import { appUrl } from "@/server/partner/email";
import { escapeHtml } from "@/lib/email-html";

export type FollowUp = typeof followUpContacts.$inferSelect & { lastTouch: { channel: string; note: string | null; at: Date } | null };

/** Everyone on the follow-up list, with the most recent thing that happened. Due and soonest first. */
export async function loadFollowUps(): Promise<FollowUp[]> {
  const [contacts, touches] = await Promise.all([
    db.select().from(followUpContacts),
    db.select().from(followUpTouches).orderBy(desc(followUpTouches.createdAt)).limit(2000),
  ]);
  const lastByContact = new Map<string, FollowUp["lastTouch"]>();
  for (const t of touches) if (!lastByContact.has(t.contactId)) lastByContact.set(t.contactId, { channel: t.channel, note: t.note, at: t.createdAt });
  return contacts
    .map((c) => ({ ...c, lastTouch: lastByContact.get(c.id) ?? null }))
    .sort((a, b) => (a.nextFollowUpAt?.getTime() ?? Infinity) - (b.nextFollowUpAt?.getTime() ?? Infinity));
}

/**
 * Raises a reminder (in the app, plus one email per person) for each follow-up that has come due and hasn't been
 * reminded about since it was last scheduled. Each reminder fires once per due date.
 */
export async function runFollowUpReminders(now = new Date()): Promise<{ reminded: number }> {
  const due = await db
    .select()
    .from(followUpContacts)
    .where(and(eq(followUpContacts.status, "active"), isNotNull(followUpContacts.nextFollowUpAt), lte(followUpContacts.nextFollowUpAt, now)));
  const fresh = due.filter((c) => !c.remindedAt || (c.nextFollowUpAt && c.remindedAt < c.nextFollowUpAt));
  if (fresh.length === 0) return { reminded: 0 };

  const claimed: typeof fresh = [];
  for (const c of fresh) {
    // Claim before announcing, so two overlapping runs can't both remind.
    const [row] = await db
      .update(followUpContacts)
      .set({ remindedAt: now })
      .where(and(eq(followUpContacts.id, c.id), c.remindedAt ? eq(followUpContacts.remindedAt, c.remindedAt) : isNull(followUpContacts.remindedAt)))
      .returning({ id: followUpContacts.id });
    if (row) claimed.push(c);
  }

  const byOwner = new Map<string, typeof claimed>();
  for (const c of claimed) if (c.ownerUserId) byOwner.set(c.ownerUserId, [...(byOwner.get(c.ownerUserId) ?? []), c]);
  const from = await sender();
  for (const [ownerId, list] of byOwner) {
    await createNotifications([ownerId], {
      type: "follow_up_due",
      title: list.length === 1 ? `Follow up with ${list[0].name}` : `${list.length} people to follow up with`,
      body: list.map((c) => c.name).join(", "),
      href: "/marketing/follow-ups",
    });
    const owner = await db.query.users.findFirst({ where: eq(users.id, ownerId), columns: { email: true } });
    if (!from || !owner?.email) continue;
    try {
      const rows = list
        .map((c) => {
          const how = [c.phone, c.email].filter(Boolean).map((v) => escapeHtml(v!)).join(" · ");
          return `<li style="margin:0 0 8px;"><strong>${escapeHtml(c.name)}</strong>${how ? ` — ${how}` : ""}${c.notes ? `<br><span style="color:#6b7280;">${escapeHtml(c.notes)}</span>` : ""}</li>`;
        })
        .join("");
      await sendGmailAs(from.id, from.email, {
        to: owner.email,
        subject: list.length === 1 ? `Time to follow up with ${list[0].name}` : `${list.length} people to follow up with today`,
        body: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;"><p>Your personal follow-ups that are due:</p><ul style="padding-left:18px;">${rows}</ul><p><a href="${escapeHtml(appUrl())}/marketing/follow-ups">Open the Follow Up Assistant</a></p></div>`,
        html: true,
        category: "follow_up_reminder",
      });
    } catch (err) {
      console.error("Follow-up reminder email failed:", err);
    }
  }
  return { reminded: claimed.length };
}
