"use server";

import { and, asc, desc, eq, gt, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import {
  deals,
  teamChatAttachments,
  teamChatMembers,
  teamChatMessages,
  teamChatReactions,
  teamChatReads,
  teamChatRooms,
  users,
} from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { roomAccess } from "@/server/team-chat-access";
import { resolveStagedFiles } from "@/server/staged-uploads";
import { ALLOWED_REACTIONS } from "@/lib/chat-reactions";

// Internal-only: nothing in here touches the client texting tables.

async function requireRoomAccess(roomId: string) {
  const user = await requireUser();
  const { room, allowed } = await roomAccess(roomId, user);
  if (!room || !allowed) throw new Error("You don't have access to this chat");
  return { user, room };
}

/** Like requireRoomAccess, but an admin may also manage the members of any group chat without being in it. */
async function requireMembersAccess(roomId: string) {
  const user = await requireUser();
  const { room, allowed } = await roomAccess(roomId, user);
  if (!room || !(allowed || (user.isAdmin && room.kind === "group"))) throw new Error("You don't have access to this chat");
  return { user, room };
}

/**
 * Who may rename or delete a chat. Group chats: an admin or whoever created it. Direct messages: whoever
 * started it. General and deal chats are never renamed or deleted here (a deal chat belongs to its loan).
 */
function canManageRoom(room: { kind: string; createdByUserId: string | null }, user: { id: string; isAdmin: boolean }) {
  if (room.kind === "group") return user.isAdmin || room.createdByUserId === user.id;
  if (room.kind === "dm") return room.createdByUserId === user.id;
  return false;
}

async function requireManageRoom(roomId: string) {
  const user = await requireUser();
  const room = await db.query.teamChatRooms.findFirst({ where: eq(teamChatRooms.id, roomId) });
  if (!room || !canManageRoom(room, user)) throw new Error("You can't change this chat");
  return { user, room };
}


async function generalRoomId(): Promise<string> {
  const existing = await db.query.teamChatRooms.findFirst({ where: eq(teamChatRooms.kind, "general") });
  if (existing) return existing.id;
  const [created] = await db.insert(teamChatRooms).values({ kind: "general" }).returning({ id: teamChatRooms.id });
  return created.id;
}

export async function getGeneralRoomId(): Promise<string> {
  await requireUser();
  return generalRoomId();
}

export async function getDealRoomId(dealId: string): Promise<string | null> {
  const user = await requireUser();
  let room = await db.query.teamChatRooms.findFirst({ where: eq(teamChatRooms.dealId, dealId) });
  if (!room) {
    await db.insert(teamChatRooms).values({ kind: "deal", dealId }).onConflictDoNothing();
    room = await db.query.teamChatRooms.findFirst({ where: eq(teamChatRooms.dealId, dealId) });
  }
  if (!room) return null;
  const { allowed } = await roomAccess(room.id, user);
  return allowed ? room.id : null;
}

export interface ChatAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  kind: "file" | "audio";
  durationSeconds: number | null;
  transcript: string | null;
}

export interface ChatReaction {
  emoji: string;
  userIds: string[];
  /** First names, for the hover text. */
  names: string[];
}

export interface ChatMessage {
  id: string;
  userId: string;
  authorName: string;
  authorImage: string | null;
  body: string;
  parentId: string | null;
  createdAt: string;
  attachments: ChatAttachment[];
  reactions: ChatReaction[];
}

export interface ChatRoomState {
  currentUserId: string;
  messages: ChatMessage[];
  /** Who has read up to when — the basis for "Seen by". */
  readers: { userId: string; name: string; lastReadAt: string }[];
}

export async function getRoomState(roomId: string): Promise<ChatRoomState> {
  const { user } = await requireRoomAccess(roomId);
  const [messages, reads] = await Promise.all([
    db
      .select({
        id: teamChatMessages.id,
        userId: teamChatMessages.userId,
        authorName: users.name,
        authorImage: users.image,
        body: teamChatMessages.body,
        parentId: teamChatMessages.parentId,
        createdAt: teamChatMessages.createdAt,
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
  ]);
  const ids = messages.map((m) => m.id);
  const atts = ids.length
    ? await db
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
        .where(inArray(teamChatAttachments.messageId, ids))
        .orderBy(asc(teamChatAttachments.createdAt))
    : [];
  const reacts = ids.length
    ? await db
        .select({
          messageId: teamChatReactions.messageId,
          userId: teamChatReactions.userId,
          emoji: teamChatReactions.emoji,
          name: users.name,
        })
        .from(teamChatReactions)
        .innerJoin(users, eq(users.id, teamChatReactions.userId))
        .where(inArray(teamChatReactions.messageId, ids))
        .orderBy(asc(teamChatReactions.createdAt))
    : [];
  const reactionsFor = (messageId: string): ChatReaction[] => {
    const byEmoji = new Map<string, ChatReaction>();
    for (const r of reacts) {
      if (r.messageId !== messageId) continue;
      const entry = byEmoji.get(r.emoji) ?? { emoji: r.emoji, userIds: [], names: [] };
      entry.userIds.push(r.userId);
      entry.names.push((r.name ?? "Someone").split(" ")[0]);
      byEmoji.set(r.emoji, entry);
    }
    return [...byEmoji.values()];
  };
  return {
    currentUserId: user.id,
    messages: messages.map((m) => ({
      ...m,
      authorName: m.authorName ?? "Someone",
      createdAt: m.createdAt.toISOString(),
      attachments: atts
        .filter((a) => a.messageId === m.id)
        .map((a) => ({ ...a, kind: a.kind as "file" | "audio" })),
      reactions: reactionsFor(m.id),
    })),
    readers: reads.map((r) => ({ userId: r.userId, name: r.name ?? "Someone", lastReadAt: r.lastReadAt.toISOString() })),
  };
}

/** Adds my reaction to a message, or takes it back if I'd already left that one. */
export async function toggleTeamReaction(roomId: string, messageId: string, emoji: string) {
  const { user } = await requireRoomAccess(roomId);
  if (!ALLOWED_REACTIONS.has(emoji)) throw new Error("That reaction isn't available");
  const message = await db.query.teamChatMessages.findFirst({
    where: and(eq(teamChatMessages.id, messageId), eq(teamChatMessages.roomId, roomId)),
    columns: { id: true },
  });
  if (!message) throw new Error("Message not found");

  const mine = and(
    eq(teamChatReactions.messageId, messageId),
    eq(teamChatReactions.userId, user.id),
    eq(teamChatReactions.emoji, emoji)
  );
  const existing = await db.query.teamChatReactions.findFirst({ where: mine });
  if (existing) await db.delete(teamChatReactions).where(mine);
  else await db.insert(teamChatReactions).values({ messageId, userId: user.id, emoji }).onConflictDoNothing();
}

export async function markRoomRead(roomId: string) {
  const { user } = await requireRoomAccess(roomId);
  await db
    .insert(teamChatReads)
    .values({ roomId, userId: user.id, lastReadAt: new Date() })
    .onConflictDoUpdate({
      target: [teamChatReads.roomId, teamChatReads.userId],
      set: { lastReadAt: new Date() },
    });
}

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/**
 * Sends a team message. `formData` carries: body (text, optional if there's
 * an attachment), parentId (thread reply), file (repeatable), and for a
 * voice clip: audio (the recording), audioTranscript, audioSeconds.
 */
export async function sendTeamMessage(roomId: string, formData: FormData) {
  const { user } = await requireRoomAccess(roomId);
  await resolveStagedFiles(formData);
  const text = String(formData.get("body") ?? "").trim();
  const parentId = String(formData.get("parentId") ?? "") || null;
  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  const audio = formData.get("audio");
  const audioFile = audio instanceof File && audio.size > 0 ? audio : null;

  if (!text && files.length === 0 && !audioFile) throw new Error("Type a message or attach something first");
  if (text.length > 4000) throw new Error("That message is too long");
  for (const f of [...files, ...(audioFile ? [audioFile] : [])]) {
    if (f.size > MAX_ATTACHMENT_BYTES) throw new Error(`${f.name || "That file"} is over the 25MB limit`);
  }

  const [message] = await db
    .insert(teamChatMessages)
    .values({ roomId, userId: user.id, body: text, parentId })
    .returning({ id: teamChatMessages.id });

  for (const f of files) {
    await db.insert(teamChatAttachments).values({
      messageId: message.id,
      fileName: f.name || "file",
      mimeType: f.type || "application/octet-stream",
      fileSize: f.size,
      data: Buffer.from(await f.arrayBuffer()).toString("base64"),
      kind: "file",
    });
  }
  if (audioFile) {
    const seconds = Number(formData.get("audioSeconds"));
    await db.insert(teamChatAttachments).values({
      messageId: message.id,
      fileName: audioFile.name || "Voice clip",
      mimeType: audioFile.type || "audio/webm",
      fileSize: audioFile.size,
      data: Buffer.from(await audioFile.arrayBuffer()).toString("base64"),
      kind: "audio",
      durationSeconds: Number.isFinite(seconds) ? Math.round(seconds) : null,
      transcript: String(formData.get("audioTranscript") ?? "").trim() || null,
    });
  }

  await db.update(teamChatRooms).set({ lastMessageAt: new Date() }).where(eq(teamChatRooms.id, roomId));
  await markRoomRead(roomId);
}

async function attachmentPreview(messageId: string): Promise<string> {
  const [a] = await db
    .select({ kind: teamChatAttachments.kind, fileName: teamChatAttachments.fileName, transcript: teamChatAttachments.transcript })
    .from(teamChatAttachments)
    .where(eq(teamChatAttachments.messageId, messageId))
    .limit(1);
  if (!a) return "";
  return a.kind === "audio" ? `🎤 Voice clip${a.transcript ? `: ${a.transcript}` : ""}` : `📎 ${a.fileName}`;
}

export interface ChatRoomSummary {
  roomId: string;
  kind: "general" | "group" | "deal" | "dm";
  dealId: string | null;
  title: string;
  lastMessage: { authorName: string; body: string; createdAt: string } | null;
  unread: number;
  /** Whether the current user may rename or delete it (see canManageRoom). */
  canManage: boolean;
}

/** Every room the current user can see, newest activity first (General always included). */
export async function getChatRooms(onlyWithActivity = false): Promise<{ rooms: ChatRoomSummary[]; totalUnread: number }> {
  const user = await requireUser();
  await generalRoomId();

  const rooms = await db
    .select({
      id: teamChatRooms.id,
      kind: teamChatRooms.kind,
      dealId: teamChatRooms.dealId,
      lastMessageAt: teamChatRooms.lastMessageAt,
      name: teamChatRooms.name,
      createdByUserId: teamChatRooms.createdByUserId,
      borrowerName: deals.borrowerName,
      propertyAddress: deals.propertyAddress,
    })
    .from(teamChatRooms)
    .leftJoin(deals, eq(deals.id, teamChatRooms.dealId))
    .where(onlyWithActivity ? isNotNull(teamChatRooms.lastMessageAt) : undefined)
    .orderBy(desc(sql`coalesce(${teamChatRooms.lastMessageAt}, ${teamChatRooms.createdAt})`));

  // A direct message is titled with the other person, which differs per viewer.
  const dmRows = await db
    .select({ roomId: teamChatMembers.roomId, userId: teamChatMembers.userId, name: users.name })
    .from(teamChatMembers)
    .innerJoin(users, eq(users.id, teamChatMembers.userId))
    .innerJoin(teamChatRooms, eq(teamChatRooms.id, teamChatMembers.roomId))
    .where(eq(teamChatRooms.kind, "dm"));
  const dmTitle = (roomId: string) =>
    dmRows.find((m) => m.roomId === roomId && m.userId !== user.id)?.name ?? "Direct message";

  const summaries: ChatRoomSummary[] = [];
  for (const r of rooms) {
    const { allowed } = await roomAccess(r.id, user);
    if (!allowed) continue;
    const [last] = await db
      .select({
        id: teamChatMessages.id,
        body: teamChatMessages.body,
        createdAt: teamChatMessages.createdAt,
        authorName: users.name,
      })
      .from(teamChatMessages)
      .innerJoin(users, eq(users.id, teamChatMessages.userId))
      .where(eq(teamChatMessages.roomId, r.id))
      .orderBy(desc(teamChatMessages.createdAt))
      .limit(1);

    const read = await db.query.teamChatReads.findFirst({
      where: and(eq(teamChatReads.roomId, r.id), eq(teamChatReads.userId, user.id)),
    });
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(teamChatMessages)
      .where(
        and(
          eq(teamChatMessages.roomId, r.id),
          ne(teamChatMessages.userId, user.id),
          read ? gt(teamChatMessages.createdAt, read.lastReadAt) : undefined
        )
      );

    summaries.push({
      roomId: r.id,
      kind: r.kind as "general" | "group" | "deal" | "dm",
      dealId: r.dealId,
      title:
        r.kind === "general"
          ? "General"
          : r.kind === "dm"
            ? dmTitle(r.id)
            : r.kind === "group"
              ? (r.name ?? "Group chat")
              : `${r.borrowerName} · ${r.propertyAddress}`,
      lastMessage: last
        ? {
            authorName: last.authorName ?? "Someone",
            body: last.body || (await attachmentPreview(last.id)),
            createdAt: last.createdAt.toISOString(),
          }
        : null,
      unread: n,
      canManage: canManageRoom(r, user),
    });
  }
  return { rooms: summaries, totalUnread: summaries.reduce((sum, r) => sum + r.unread, 0) };
}

export interface ChatUser {
  id: string;
  name: string;
  role: string;
}

/** Everyone who can be added to a chat. */
export async function listChatUsers(): Promise<ChatUser[]> {
  await requireUser();
  const rows = await db.query.users.findMany({ where: eq(users.active, true), orderBy: asc(users.name) });
  return rows.map((u) => ({ id: u.id, name: u.name ?? u.email ?? "Unnamed", role: u.baseRole }));
}

export async function createGroupChat(name: string, memberIds: string[]): Promise<string> {
  const user = await requireUser();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Give the chat a name");
  const ids = [...new Set([user.id, ...memberIds])];
  const [room] = await db
    .insert(teamChatRooms)
    .values({ kind: "group", name: trimmed, createdByUserId: user.id })
    .returning({ id: teamChatRooms.id });
  await db.insert(teamChatMembers).values(ids.map((id) => ({ roomId: room.id, userId: id, addedByUserId: user.id })));
  return room.id;
}

/**
 * Starts a chat from the "new message" box: one person opens (or reuses) your direct message with them,
 * several people make a group. Returns the room to open.
 */
export async function startTeamConversation(memberIds: string[], name?: string): Promise<{ roomId: string; title: string }> {
  const user = await requireUser();
  const others = [...new Set(memberIds)].filter((id) => id !== user.id);
  if (others.length === 0) throw new Error("Pick at least one person");
  const people = await db.query.users.findMany({ where: and(inArray(users.id, others), eq(users.active, true)) });
  if (people.length !== others.length) throw new Error("One of those people isn't available");

  if (others.length === 1) {
    const [other] = people;
    const mine = await db
      .select({ roomId: teamChatMembers.roomId })
      .from(teamChatMembers)
      .innerJoin(teamChatRooms, eq(teamChatRooms.id, teamChatMembers.roomId))
      .where(and(eq(teamChatRooms.kind, "dm"), eq(teamChatMembers.userId, user.id)));
    if (mine.length) {
      const [shared] = await db
        .select({ roomId: teamChatMembers.roomId })
        .from(teamChatMembers)
        .where(and(inArray(teamChatMembers.roomId, mine.map((m) => m.roomId)), eq(teamChatMembers.userId, other.id)))
        .limit(1);
      if (shared) return { roomId: shared.roomId, title: other.name ?? "Direct message" };
    }
    const [room] = await db
      .insert(teamChatRooms)
      .values({ kind: "dm", createdByUserId: user.id })
      .returning({ id: teamChatRooms.id });
    await db.insert(teamChatMembers).values([user.id, other.id].map((id) => ({ roomId: room.id, userId: id, addedByUserId: user.id })));
    return { roomId: room.id, title: other.name ?? "Direct message" };
  }

  const title = name?.trim() || people.map((p) => (p.name ?? "Someone").split(" ")[0]).join(", ");
  const roomId = await createGroupChat(title, others);
  return { roomId, title };
}

export interface ChatMember {
  userId: string;
  name: string;
  /** Why they have access: their role on the deal, "Admin", "Added", or "Creator". */
  reason: string;
  /** Only people who were explicitly added can be taken off a chat here. */
  removable: boolean;
}

export async function getRoomMembers(roomId: string): Promise<{ kind: string; members: ChatMember[] }> {
  const { room } = await requireMembersAccess(roomId);
  if (room.kind === "general") return { kind: "general", members: [] };

  const explicit = await db
    .select({ userId: teamChatMembers.userId, name: users.name, active: users.active })
    .from(teamChatMembers)
    .innerJoin(users, eq(users.id, teamChatMembers.userId))
    .where(eq(teamChatMembers.roomId, roomId));

  const byId = new Map<string, ChatMember>();
  if (room.kind === "deal") {
    const admins = await db.query.users.findMany({ where: and(eq(users.isAdmin, true), eq(users.active, true)) });
    for (const a of admins) byId.set(a.id, { userId: a.id, name: a.name ?? "Admin", reason: "Admin", removable: false });
    const roleUsers = await db.query.users.findMany({
      where: inArray(users.id, [room.loId, room.procId, room.asstId].filter((x): x is string => Boolean(x))),
    });
    const label = (id: string) => (id === room.loId ? "Loan officer" : id === room.procId ? "Processor" : "Assistant");
    for (const u of roleUsers) byId.set(u.id, { userId: u.id, name: u.name ?? "Team member", reason: label(u.id), removable: false });
  }
  for (const m of explicit) {
    if (!m.active || byId.has(m.userId)) continue;
    byId.set(m.userId, {
      userId: m.userId,
      name: m.name ?? "Team member",
      reason: m.userId === room.createdByUserId ? "Creator" : "Added",
      removable: m.userId !== room.createdByUserId,
    });
  }
  return { kind: room.kind, members: [...byId.values()] };
}

export async function addRoomMember(roomId: string, userId: string) {
  const { user, room } = await requireMembersAccess(roomId);
  if (room.kind === "general") throw new Error("Everyone is already in General");
  if (room.kind === "dm") throw new Error("Start a group chat to add more people");
  await db.insert(teamChatMembers).values({ roomId, userId, addedByUserId: user.id }).onConflictDoNothing();
}

export async function removeRoomMember(roomId: string, userId: string) {
  const { room } = await requireMembersAccess(roomId);
  if (room.kind === "general") throw new Error("Everyone is in General");
  if (userId === room.createdByUserId) throw new Error("The person who created this chat can't be removed");
  await db.delete(teamChatMembers).where(and(eq(teamChatMembers.roomId, roomId), eq(teamChatMembers.userId, userId)));
}

export async function renameGroupChat(roomId: string, name: string) {
  const { room } = await requireManageRoom(roomId);
  if (room.kind !== "group") throw new Error("Only group chats can be renamed");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Give the chat a name");
  await db.update(teamChatRooms).set({ name: trimmed }).where(eq(teamChatRooms.id, roomId));
}

/** Deletes a group chat or direct message with everything in it (messages, files, reactions). */
export async function deleteTeamChat(roomId: string) {
  await requireManageRoom(roomId);
  await db.delete(teamChatRooms).where(eq(teamChatRooms.id, roomId));
}

export interface ManageableGroupChat {
  roomId: string;
  name: string;
  createdByName: string | null;
  memberNames: string[];
  lastMessageAt: string | null;
}

/** Admin only: group chats the admin isn't in, so they can be renamed, re-membered or deleted. Contents stay private. */
export async function getOtherGroupChats(): Promise<ManageableGroupChat[]> {
  const user = await requireUser();
  if (!user.isAdmin) return [];
  const mine = await db.select({ roomId: teamChatMembers.roomId }).from(teamChatMembers).where(eq(teamChatMembers.userId, user.id));
  const mineIds = new Set(mine.map((m) => m.roomId));
  const groups = await db.query.teamChatRooms.findMany({
    where: eq(teamChatRooms.kind, "group"),
    orderBy: desc(sql`coalesce(${teamChatRooms.lastMessageAt}, ${teamChatRooms.createdAt})`),
  });
  const others = groups.filter((g) => !mineIds.has(g.id));
  if (others.length === 0) return [];
  const members = await db
    .select({ roomId: teamChatMembers.roomId, name: users.name })
    .from(teamChatMembers)
    .innerJoin(users, eq(users.id, teamChatMembers.userId))
    .where(inArray(teamChatMembers.roomId, others.map((g) => g.id)));
  const creators = await db.query.users.findMany({
    where: inArray(users.id, others.map((g) => g.createdByUserId).filter((x): x is string => Boolean(x))),
  });
  return others.map((g) => ({
    roomId: g.id,
    name: g.name ?? "Group chat",
    createdByName: creators.find((c) => c.id === g.createdByUserId)?.name ?? null,
    memberNames: members.filter((m) => m.roomId === g.id).map((m) => m.name ?? "Someone"),
    lastMessageAt: g.lastMessageAt ? g.lastMessageAt.toISOString() : null,
  }));
}
