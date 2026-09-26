"use server";

import { and, asc, desc, eq, gt, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals, teamChatMessages, teamChatReads, teamChatRooms, users } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";

// Internal-only: nothing in here touches the client texting tables.

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

export async function getDealRoomId(dealId: string): Promise<string> {
  await requireUser();
  const existing = await db.query.teamChatRooms.findFirst({ where: eq(teamChatRooms.dealId, dealId) });
  if (existing) return existing.id;
  const [created] = await db
    .insert(teamChatRooms)
    .values({ kind: "deal", dealId })
    .onConflictDoNothing()
    .returning({ id: teamChatRooms.id });
  if (created) return created.id;
  const again = await db.query.teamChatRooms.findFirst({ where: eq(teamChatRooms.dealId, dealId) });
  return again!.id;
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
  const user = await requireUser();
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
  const user = await requireUser();
  await db
    .insert(teamChatReads)
    .values({ roomId, userId: user.id, lastReadAt: new Date() })
    .onConflictDoUpdate({
      target: [teamChatReads.roomId, teamChatReads.userId],
      set: { lastReadAt: new Date() },
    });
}

export async function sendTeamMessage(roomId: string, body: string, parentId: string | null = null) {
  const user = await requireUser();
  const text = body.trim();
  if (!text) throw new Error("Type a message first");
  if (text.length > 4000) throw new Error("That message is too long");
  await db.insert(teamChatMessages).values({ roomId, userId: user.id, body: text, parentId });
  await db.update(teamChatRooms).set({ lastMessageAt: new Date() }).where(eq(teamChatRooms.id, roomId));
  await markRoomRead(roomId);
}

export interface ChatRoomSummary {
  roomId: string;
  kind: "general" | "deal";
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
      borrowerName: deals.borrowerName,
      propertyAddress: deals.propertyAddress,
    })
    .from(teamChatRooms)
    .leftJoin(deals, eq(deals.id, teamChatRooms.dealId))
    .where(onlyWithActivity ? isNotNull(teamChatRooms.lastMessageAt) : undefined)
    .orderBy(desc(sql`coalesce(${teamChatRooms.lastMessageAt}, ${teamChatRooms.createdAt})`));

  const summaries: ChatRoomSummary[] = [];
  for (const r of rooms) {
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
      kind: r.kind as "general" | "deal",
      dealId: r.dealId,
      title: r.kind === "general" ? "General" : `${r.borrowerName} · ${r.propertyAddress}`,
      lastMessage: last
        ? { authorName: last.authorName ?? "Someone", body: last.body, createdAt: last.createdAt.toISOString() }
        : null,
      unread: n,
    });
  }
  return { rooms: summaries, totalUnread: summaries.reduce((sum, r) => sum + r.unread, 0) };
}
