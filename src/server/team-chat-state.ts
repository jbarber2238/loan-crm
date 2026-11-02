import { asc, eq } from "drizzle-orm";
import { after } from "next/server";
import { db } from "@/server/db/client";
import { teamChatAttachments, teamChatMessages, teamChatReactions, teamChatReads, users } from "@/server/db/schema";
import { roomAccess } from "@/server/team-chat-access";
import type { ChatReaction, ChatRoomState } from "@/server/actions/team-chat";

export async function upsertRead(roomId: string, userId: string) {
  await db
    .insert(teamChatReads)
    .values({ roomId, userId, lastReadAt: new Date() })
    .onConflictDoUpdate({
      target: [teamChatReads.roomId, teamChatReads.userId],
      set: { lastReadAt: new Date() },
    });
}

/**
 * A chat's messages, attachments, reactions and who has read it, as the chat window shows them. Everything is
 * looked up at the same time as the access check (one round trip to the database instead of four in a row) and
 * thrown away if the person isn't allowed in. Marking the chat read happens just after the answer is sent.
 */
export async function loadRoomState(user: { id: string; isAdmin: boolean }, roomId: string, markRead: boolean): Promise<ChatRoomState> {
  const [access, messages, reads, atts, reacts] = await Promise.all([
    roomAccess(roomId, user),
    db
      .select({
        id: teamChatMessages.id,
        userId: teamChatMessages.userId,
        authorName: users.name,
        authorImage: users.image,
        body: teamChatMessages.body,
        parentId: teamChatMessages.parentId,
        createdAt: teamChatMessages.createdAt,
        editedAt: teamChatMessages.editedAt,
      })
      .from(teamChatMessages)
      .innerJoin(users, eq(users.id, teamChatMessages.userId))
      .where(eq(teamChatMessages.roomId, roomId))
      .orderBy(asc(teamChatMessages.createdAt)),
    db
      .select({ userId: teamChatReads.userId, name: users.name, lastReadAt: teamChatReads.lastReadAt })
      .from(teamChatReads)
      .innerJoin(users, eq(users.id, teamChatReads.userId))
      .where(eq(teamChatReads.roomId, roomId)),
    db
      .select({
        id: teamChatAttachments.id,
        messageId: teamChatAttachments.messageId,
        fileName: teamChatAttachments.fileName,
        mimeType: teamChatAttachments.mimeType,
        fileSize: teamChatAttachments.fileSize,
        kind: teamChatAttachments.kind,
        durationSeconds: teamChatAttachments.durationSeconds,
        transcript: teamChatAttachments.transcript,
      })
      .from(teamChatAttachments)
      .innerJoin(teamChatMessages, eq(teamChatMessages.id, teamChatAttachments.messageId))
      .where(eq(teamChatMessages.roomId, roomId))
      .orderBy(asc(teamChatAttachments.createdAt)),
    db
      .select({ messageId: teamChatReactions.messageId, userId: teamChatReactions.userId, emoji: teamChatReactions.emoji, name: users.name })
      .from(teamChatReactions)
      .innerJoin(teamChatMessages, eq(teamChatMessages.id, teamChatReactions.messageId))
      .innerJoin(users, eq(users.id, teamChatReactions.userId))
      .where(eq(teamChatMessages.roomId, roomId))
      .orderBy(asc(teamChatReactions.createdAt)),
  ]);
  if (!access.room || !access.allowed) throw new Error("You don't have access to this chat");
  if (markRead) after(() => upsertRead(roomId, user.id));

  const attachmentsByMessage = new Map<string, typeof atts>();
  for (const a of atts) attachmentsByMessage.set(a.messageId, [...(attachmentsByMessage.get(a.messageId) ?? []), a]);
  const reactionsByMessage = new Map<string, ChatReaction[]>();
  for (const r of reacts) {
    const list = reactionsByMessage.get(r.messageId) ?? [];
    const entry = list.find((x) => x.emoji === r.emoji) ?? { emoji: r.emoji, userIds: [], names: [] };
    entry.userIds.push(r.userId);
    entry.names.push(r.name ?? "Someone");
    if (!list.includes(entry)) list.push(entry);
    reactionsByMessage.set(r.messageId, list);
  }
  return {
    currentUserId: user.id,
    messages: messages.map((m) => ({
      ...m,
      authorName: m.authorName ?? "Someone",
      createdAt: m.createdAt.toISOString(),
      editedAt: m.editedAt ? m.editedAt.toISOString() : null,
      attachments: (attachmentsByMessage.get(m.id) ?? []).map((a) => ({ ...a, kind: a.kind as "file" | "audio" })),
      reactions: reactionsByMessage.get(m.id) ?? [],
    })),
    readers: reads.map((r) => ({ userId: r.userId, name: r.name ?? "Someone", lastReadAt: r.lastReadAt.toISOString() })),
  };
}

