import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals, teamChatMembers, teamChatRooms } from "@/server/db/schema";

// Access rules: General is open to every active user; a group chat is its
// members only; a deal chat is that deal's loan officer, processor, assistant
// and admins, plus anyone explicitly added (e.g. a covering processor).
export async function roomAccess(roomId: string, user: { id: string; isAdmin: boolean }) {
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

