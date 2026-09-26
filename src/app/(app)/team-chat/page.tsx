import Link from "next/link";
import { getChatRooms, getGeneralRoomId } from "@/server/actions/team-chat";
import { TeamChatPanel } from "@/components/team-chat/team-chat-panel";
import { cn } from "@/lib/utils";

export default async function TeamChatPage({ searchParams }: { searchParams: Promise<{ room?: string }> }) {
  const { room } = await searchParams;
  const [{ rooms }, generalId] = await Promise.all([getChatRooms(), getGeneralRoomId()]);
  const activeId = rooms.some((r) => r.roomId === room) ? room! : generalId;
  const active = rooms.find((r) => r.roomId === activeId);
  // General first, then deal chats that have had any activity.
  const list = [...rooms.filter((r) => r.kind === "general"), ...rooms.filter((r) => r.kind === "deal" && r.lastMessage)];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Team Chat</h1>
        <p className="text-sm text-muted-foreground">Internal only. Borrowers never see anything here.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-[280px_1fr]">
        <ul className="space-y-1">
          {list.map((r) => (
            <li key={r.roomId}>
              <Link
                href={`/team-chat?room=${r.roomId}`}
                className={cn(
                  "block rounded-md border px-3 py-2 text-sm hover:bg-muted/50",
                  r.roomId === activeId && "border-primary bg-primary/5"
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{r.title}</span>
                  {r.unread > 0 && (
                    <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                      {r.unread}
                    </span>
                  )}
                </span>
                {r.lastMessage && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {r.lastMessage.authorName.split(" ")[0]}: {r.lastMessage.body}
                  </span>
                )}
                {r.kind === "deal" && r.dealId && <span className="block text-[11px] text-muted-foreground">Deal chat</span>}
              </Link>
            </li>
          ))}
        </ul>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{active?.title ?? "General"}</h2>
            {active?.kind === "deal" && active.dealId && (
              <Link href={`/deals/${active.dealId}/loan-center?tab=team-chat`} className="text-xs text-primary hover:underline">
                Open deal
              </Link>
            )}
          </div>
          <TeamChatPanel key={activeId} roomId={activeId} heightClass="h-[calc(100vh-14rem)] min-h-[420px]" />
        </div>
      </div>
    </div>
  );
}
