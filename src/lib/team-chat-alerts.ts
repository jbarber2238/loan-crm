import { findMentionedIds } from "@/lib/chat-mentions";

/**
 * Which new team messages stay on screen until someone deals with them. Direct messages and anything that tags the
 * viewer with @ are meant for them personally; everything else (General, groups, deal chats) is shown briefly.
 */
export function isPersonalMessage(
  room: { kind: "general" | "group" | "deal" | "dm" },
  body: string,
  me: { id: string; name: string }
): boolean {
  if (room.kind === "dm") return true;
  return findMentionedIds(body, [{ id: me.id, name: me.name }]).includes(me.id);
}
