import { getChatRooms, getGeneralRoomId, getOtherGroupChats } from "@/server/actions/team-chat";
import { requireUser } from "@/server/auth/guards";
import { TeamChatShell } from "@/components/team-chat/team-chat-shell";

// The page only loads the chat list; picking a chat is handled in the browser (see TeamChatShell), so it opens at once.
export default async function TeamChatPage() {
  const me = await requireUser();
  const [{ rooms }, generalId, otherGroups] = await Promise.all([getChatRooms(), getGeneralRoomId(), getOtherGroupChats()]);
  return <TeamChatShell currentUserId={me.id} rooms={rooms} generalId={generalId} otherGroups={otherGroups} />;
}
