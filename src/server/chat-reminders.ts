import { and, eq, gt, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { notifications, teamChatMembers, teamChatMessages, teamChatReads, teamChatRooms, users } from "@/server/db/schema";
import { pushToUsers } from "@/server/push";
import { REMIND_AFTER_MS, REMIND_SLOT_MS, reminderDue, withinReminderHours } from "@/lib/chat-reminder-rules";

interface Reminder {
  userId: string;
  roomId: string;
  title: string;
  body: string;
}

/**
 * One push reminder for a team message meant for a person (a direct message, or a tag with @) that they still
 * haven't read 10 minutes after it came in. Push only: no email, no repeats, nothing overnight, and General and
 * group chatter never nags. Each person's own push settings still decide whether it reaches them.
 * `dryRun` returns who would be reminded without sending anything.
 */
export async function remindUnreadChats(now = new Date(), dryRun = false): Promise<{ due: number; sent: number }> {
  if (!withinReminderHours(now)) return { due: 0, sent: 0 };
  const slotStart = new Date(now.getTime() - REMIND_AFTER_MS - REMIND_SLOT_MS);
  const slotEnd = new Date(now.getTime() - REMIND_AFTER_MS);
  const reminders = new Map<string, Reminder>();

  // Tags: the notification made when someone was tagged, still unanswered after 10 minutes.
  const tagged = await db
    .select({ userId: notifications.userId, title: notifications.title, body: notifications.body, href: notifications.href, createdAt: notifications.createdAt })
    .from(notifications)
    .where(and(eq(notifications.type, "chat_mention"), isNull(notifications.readAt), gte(notifications.createdAt, slotStart), lt(notifications.createdAt, slotEnd)));
  const refs = tagged
    .map((n) => {
      const q = new URLSearchParams((n.href ?? "").split("?")[1] ?? "");
      return { n, roomId: q.get("room"), messageId: q.get("message") };
    })
    .filter((r): r is typeof r & { roomId: string; messageId: string } => Boolean(r.roomId && r.messageId));
  if (refs.length > 0) {
    const [messages, reads] = await Promise.all([
      db.select({ id: teamChatMessages.id, createdAt: teamChatMessages.createdAt }).from(teamChatMessages).where(inArray(teamChatMessages.id, refs.map((r) => r.messageId))),
      db.select().from(teamChatReads).where(inArray(teamChatReads.roomId, refs.map((r) => r.roomId))),
    ]);
    const sentAt = new Map(messages.map((m) => [m.id, m.createdAt]));
    for (const { n, roomId, messageId } of refs) {
      const created = sentAt.get(messageId);
      if (!created) continue;
      const read = reads.find((r) => r.roomId === roomId && r.userId === n.userId);
      if (read && read.lastReadAt >= created) continue;
      reminders.set(`${n.userId}:${roomId}`, { userId: n.userId, roomId, title: `${n.title.replace(/ tagged you in .*/, "")} is still waiting on you`, body: n.body ?? "You were tagged in a team chat." });
    }
  }

  // Direct messages: the oldest unread one has been sitting 10 minutes.
  const oldest = sql<Date>`min(${teamChatMessages.createdAt})`;
  const direct = await db
    .select({
      userId: teamChatMembers.userId,
      roomId: teamChatMessages.roomId,
      oldest,
      count: sql<number>`count(*)::int`,
      senderName: sql<string>`max(${users.name})`,
    })
    .from(teamChatMessages)
    .innerJoin(teamChatRooms, and(eq(teamChatRooms.id, teamChatMessages.roomId), eq(teamChatRooms.kind, "dm")))
    .innerJoin(teamChatMembers, and(eq(teamChatMembers.roomId, teamChatMessages.roomId), ne(teamChatMembers.userId, teamChatMessages.userId)))
    .innerJoin(users, eq(users.id, teamChatMessages.userId))
    .leftJoin(teamChatReads, and(eq(teamChatReads.roomId, teamChatMessages.roomId), eq(teamChatReads.userId, teamChatMembers.userId)))
    .where(
      and(
        gte(teamChatRooms.lastMessageAt, new Date(now.getTime() - 24 * 60 * 60_000)),
        or(isNull(teamChatReads.lastReadAt), gt(teamChatMessages.createdAt, teamChatReads.lastReadAt))
      )
    )
    .groupBy(teamChatMembers.userId, teamChatMessages.roomId);
  for (const d of direct) {
    if (!reminderDue(new Date(d.oldest), now)) continue;
    const key = `${d.userId}:${d.roomId}`;
    if (reminders.has(key)) continue;
    const who = d.senderName?.trim() || "Someone";
    reminders.set(key, { userId: d.userId, roomId: d.roomId, title: `${who} is waiting on you`, body: d.count > 1 ? `${d.count} unread messages in your direct chat.` : "You have an unread direct message." });
  }

  if (reminders.size === 0 || dryRun) return { due: reminders.size, sent: 0 };

  // Only active people, and one push per chat; pushToUsers applies each person's own push settings.
  const active = new Set((await db.select({ id: users.id }).from(users).where(and(inArray(users.id, [...new Set([...reminders.values()].map((r) => r.userId))]), eq(users.active, true)))).map((u) => u.id));
  let sent = 0;
  for (const r of reminders.values()) {
    if (!active.has(r.userId)) continue;
    sent += await pushToUsers([r.userId], { title: r.title, body: r.body, href: `/team-chat?room=${r.roomId}`, category: "chat_direct", tag: `chat-remind-${r.roomId}` });
  }
  return { due: reminders.size, sent };
}
