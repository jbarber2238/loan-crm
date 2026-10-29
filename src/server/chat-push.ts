import { and, eq, ne } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals, teamChatMembers, teamChatRooms, users } from "@/server/db/schema";
import { pushToUsers } from "@/server/push";
import { gifInMessage } from "@/lib/chat-gif";

/**
 * Pushes a new team-chat message to the people it's meant for: the other members of a direct or group chat, the
 * people on a deal's chat, or (for the team-wide General room) everyone. Each person's own settings decide whether
 * it actually reaches their phone. Never throws.
 */
export async function pushChatMessage(input: { roomId: string; senderId: string; senderName: string; text: string; attachment: "file" | "voice" | null }): Promise<void> {
  try {
    const [room] = await db
      .select({
        kind: teamChatRooms.kind,
        name: teamChatRooms.name,
        dealId: teamChatRooms.dealId,
        borrower: deals.borrowerName,
        loId: deals.assignedLoanOfficerId,
        procId: deals.assignedProcessorId,
        asstId: deals.assignedAssistantId,
      })
      .from(teamChatRooms)
      .leftJoin(deals, eq(deals.id, teamChatRooms.dealId))
      .where(eq(teamChatRooms.id, input.roomId));
    if (!room) return;

    const members = (await db.select({ userId: teamChatMembers.userId }).from(teamChatMembers).where(eq(teamChatMembers.roomId, input.roomId))).map((m) => m.userId);
    let recipients: string[];
    if (room.kind === "general") {
      recipients = (await db.select({ id: users.id }).from(users).where(and(eq(users.active, true), ne(users.id, input.senderId)))).map((u) => u.id);
    } else if (room.kind === "deal") {
      recipients = [room.loId, room.procId, room.asstId, ...members].filter((id): id is string => Boolean(id));
    } else {
      recipients = members;
    }
    recipients = recipients.filter((id) => id !== input.senderId);
    if (recipients.length === 0) return;

    const who = input.senderName.trim() || "Someone";
    const title = room.kind === "dm" ? who : room.kind === "group" ? `${who} in ${room.name ?? "a group chat"}` : room.kind === "deal" ? `${who} · ${room.borrower ?? "a deal"}` : `${who} in General`;
    const body = gifInMessage(input.text) ? "Sent a GIF" : input.text.trim() ? input.text.trim().slice(0, 140) : input.attachment === "voice" ? "Sent a voice clip" : input.attachment === "file" ? "Sent a file" : "";
    await pushToUsers(recipients, {
      title,
      body,
      href: `/team-chat?room=${input.roomId}`,
      category: room.kind === "general" ? "chat_general" : "chat_direct",
      tag: `chat-${input.roomId}`,
    });
  } catch (err) {
    console.error("Chat push failed:", err);
  }
}
