"use server";

import { and, asc, desc, eq, gt, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals, teamChatMembers, teamChatMessages, teamChatReads, teamChatRooms, users } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";

// Internal-only: nothing in here touches the client texting tables.

// Access rules: General is open to every active user; a group chat is its
// members only; a deal chat is that deal's loan officer, processor, assistant
// and admins, plus anyone explicitly added (e.g. a covering processor).
async function roomAccess(roomId: string, user: { id: string; isAdmin: boolean }) {
  const [room] = await db
    .select({
      id: teamChatRooms.id,
      kind: teamChatRooms.kind,
      name: teamChatRooms.name,
      createdByUserId: teamChatRooms.createdByUserId,
      dealId: teamChatRooms.dealId,
      loId: deals.assignedLoanOfficerId,
      procId: deals.assignedProcessorId,
      asstId: deals.assignedAssistantId,
    })
    .from(teamChatRooms)
    .leftJoin(deals, eq(deals.id, teamChatRooms.dealId))
    .where(eq(teamChatRooms.id, roomId));
  if (!room) return { room: null, allowed: false };
  if (room.kind === "general") return { room, allowed: true };
  const member = await db.query.teamChatMembers.findFirst({
    where: and(eq(teamChatMembers.roomId, roomId), eq(teamChatMembers.userId, user.id)),
  });
  if (room.kind === "group") return { room, allowed: Boolean(member) };
  const onDeal = [room.loId, room.procId, room.asstId].includes(user.id);
  return { room, allowed: user.isAdmin || onDeal || Boolean(member) };
}

async function requireRoomAccess(roomId: string) {
  const user = await requireUser();
  const { room, allowed } = await roomAccess(roomId, user);
  if (!room || !allowed) throw new Error("You don't have access to this chat");
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

export interface ChatMessage {
  id: string;
  userId: string;
  authorName: string;
  authorImage: string | null;
  body: string;
  parentId: string | null;
  createdAt: string;
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
  return {
    currentUserId: user.id,
    messages: messages.map((m) => ({
      ...m,
      authorName: m.authorName ?? "Someone",
      createdAt: m.createdAt.toISOString(),
    })),
    readers: reads.map((r) => ({ userId: r.userId, name: r.name ?? "Someone", lastReadAt: r.lastReadAt.toISOString() })),
  };
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

export async function sendTeamMessage(roomId: string, body: string, parentId: string | null = null) {
  const { user } = await requireRoomAccess(roomId);
  const text = body.trim();
  if (!text) throw new Error("Type a message first");
  if (text.length > 4000) throw new Error("That message is too long");
  await db.insert(teamChatMessages).values({ roomId, userId: user.id, body: text, parentId });
  await db.update(teamChatRooms).set({ lastMessageAt: new Date() }).where(eq(teamChatRooms.id, roomId));
  await markRoomRead(roomId);
}

export interface ChatRoomSummary {
  roomId: string;
  kind: "general" | "group" | "deal";
  dealId: string | null;
  title: string;
  lastMessage: { authorName: string; body: string; createdAt: string } | null;
  unread: number;
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
      borrowerName: deals.borrowerName,
      propertyAddress: deals.propertyAddress,
    })
    .from(teamChatRooms)
    .leftJoin(deals, eq(deals.id, teamChatRooms.dealId))
    .where(onlyWithActivity ? isNotNull(teamChatRooms.lastMessageAt) : undefined)
    .orderBy(desc(sql`coalesce(${teamChatRooms.lastMessageAt}, ${teamChatRooms.createdAt})`));

  const summaries: ChatRoomSummary[] = [];
  for (const r of rooms) {
    const { allowed } = await roomAccess(r.id, user);
    if (!allowed) continue;
    const [last] = await db
      .select({ body: teamChatMessages.body, createdAt: teamChatMessages.createdAt, authorName: users.name })
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
      kind: r.kind as "general" | "group" | "deal",
      dealId: r.dealId,
      title:
        r.kind === "general"
          ? "General"
          : r.kind === "group"
            ? (r.name ?? "Group chat")
            : `${r.borrowerName} · ${r.propertyAddress}`,
      lastMessage: last
        ? { authorName: last.authorName ?? "Someone", body: last.body, createdAt: last.createdAt.toISOString() }
        : null,
      unread: n,
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

export interface ChatMember {
  userId: string;
  name: string;
  /** Why they have access: their role on the deal, "Admin", "Added", or "Creator". */
  reason: string;
  /** Only people who were explicitly added can be taken off a chat here. */
  removable: boolean;
}

export async function getRoomMembers(roomId: string): Promise<{ kind: string; members: ChatMember[] }> {
  const { room } = await requireRoomAccess(roomId);
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
  const { user, room } = await requireRoomAccess(roomId);
  if (room.kind === "general") throw new Error("Everyone is already in General");
  await db.insert(teamChatMembers).values({ roomId, userId, addedByUserId: user.id }).onConflictDoNothing();
}

export async function removeRoomMember(roomId: string, userId: string) {
  const { room } = await requireRoomAccess(roomId);
  if (room.kind === "general") throw new Error("Everyone is in General");
  if (userId === room.createdByUserId) throw new Error("The person who created this chat can't be removed");
  await db.delete(teamChatMembers).where(and(eq(teamChatMembers.roomId, roomId), eq(teamChatMembers.userId, userId)));
}
