import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals, teamChatMembers, teamChatRooms, users } from "@/server/db/schema";
import { createNotifications } from "@/server/notifications";
import { findMentionedIds, type MentionPerson } from "@/lib/chat-mentions";
import { gifInMessage } from "@/lib/chat-gif";

/**
 * Everyone who can be tagged in a chat: the people who can read it (the same rule as roomAccess). General is the
 * whole active team, a group chat or DM is its members, and a deal chat is the deal's people, anyone added, and admins.
 */
export async function roomPeople(roomId: string): Promise<MentionPerson[]> {
  const [room] = await db
    .select({
      kind: teamChatRooms.kind,
      loId: deals.assignedLoanOfficerId,
      procId: deals.assignedProcessorId,
      asstId: deals.assignedAssistantId,
    })
    .from(teamChatRooms)
    .leftJoin(deals, eq(deals.id, teamChatRooms.dealId))
    .where(eq(teamChatRooms.id, roomId));
  if (!room) return [];

  const active = eq(users.active, true);
  const rows =
    room.kind === "general"
      ? await db.select({ id: users.id, name: users.name }).from(users).where(active)
      : await (async () => {
          const members = (await db.select({ userId: teamChatMembers.userId }).from(teamChatMembers).where(eq(teamChatMembers.roomId, roomId))).map((m) => m.userId);
          if (room.kind !== "deal") {
            return members.length ? db.select({ id: users.id, name: users.name }).from(users).where(and(active, inArray(users.id, members))) : [];
          }
          const dealPeople = [room.loId, room.procId, room.asstId, ...members].filter((id): id is string => Boolean(id));
          const admins = await db.select({ id: users.id, name: users.name }).from(users).where(and(active, eq(users.isAdmin, true)));
          const others = dealPeople.length ? await db.select({ id: users.id, name: users.name }).from(users).where(and(active, inArray(users.id, dealPeople))) : [];
          return [...admins, ...others];
        })();

  const seen = new Set<string>();
  const people: MentionPerson[] = [];
  for (const r of rows) {
    if (!r.name?.trim() || seen.has(r.id)) continue;
    seen.add(r.id);
    people.push({ id: r.id, name: r.name.trim() });
  }
  return people.sort((a, b) => a.name.localeCompare(b.name));
}

async function roomLabel(roomId: string): Promise<string> {
  const [room] = await db
    .select({ kind: teamChatRooms.kind, name: teamChatRooms.name, borrower: deals.borrowerName })
    .from(teamChatRooms)
    .leftJoin(deals, eq(deals.id, teamChatRooms.dealId))
    .where(eq(teamChatRooms.id, roomId));
  if (!room) return "a chat";
  if (room.kind === "general") return "General";
  if (room.kind === "group") return room.name ?? "a group chat";
  if (room.kind === "deal") return room.borrower ?? "a deal chat";
  return "a direct message";
}

/**
 * Tells each person tagged in a message, in the notification bell and (if they have push on) on their phone. The
 * link opens the chat at that message. `previousText` is the text before an edit, so only people newly tagged by
 * the edit are told. Returns who was told so the ordinary new-message push can skip them (one alert, not two).
 * Never throws.
 */
export async function notifyChatMentions(input: {
  roomId: string;
  messageId: string;
  sender: { id: string; name?: string | null };
  text: string;
  previousText?: string;
}): Promise<string[]> {
  try {
    if (!input.text.includes("@")) return [];
    const people = await roomPeople(input.roomId);
    const already = new Set(input.previousText ? findMentionedIds(input.previousText, people) : []);
    const ids = findMentionedIds(input.text, people).filter((id) => id !== input.sender.id && !already.has(id));
    if (ids.length === 0) return [];

    const who = input.sender.name?.trim() || "Someone";
    const where = await roomLabel(input.roomId);
    const body = gifInMessage(input.text) ? "Sent a GIF" : input.text.trim().slice(0, 140);
    await createNotifications(ids, {
      type: "chat_mention",
      title: `${who} tagged you in ${where}`,
      body,
      href: `/team-chat?room=${input.roomId}&message=${input.messageId}`,
    });
    return ids;
  } catch (err) {
    console.error("Chat mention notification failed:", err);
    return [];
  }
}
