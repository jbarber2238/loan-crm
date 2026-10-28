import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getChatRooms, getGeneralRoomId } from "@/server/actions/team-chat";
import { requireUser } from "@/server/auth/guards";
import { NewChatDialog } from "@/components/team-chat/new-chat-dialog";
import { TeamChatPanel } from "@/components/team-chat/team-chat-panel";
import { cn } from "@/lib/utils";

export default async function TeamChatPage({ searchParams }: { searchParams: Promise<{ room?: string }> }) {
  const { room } = await searchParams;
  const me = await requireUser();
  const [{ rooms }, generalId] = await Promise.all([getChatRooms(), getGeneralRoomId()]);
  const activeId = rooms.some((r) => r.roomId === room) ? room! : generalId;
  const active = rooms.find((r) => r.roomId === activeId);
  // Three groupings: loans (a chat started under a deal, once it has had any activity), named group chats
  // (General is the whole team, so it leads), and one-on-one messages.
  const activeLoans = rooms.filter((r) => r.kind === "deal" && r.lastMessage);
  const groupChats = [...rooms.filter((r) => r.kind === "general"), ...rooms.filter((r) => r.kind === "group")];
  const directMessages = rooms.filter((r) => r.kind === "dm");
  const sections = [
    { label: "Active Loans", items: activeLoans, empty: "Chats started on a loan show up here." },
    { label: "Group Team Chats", items: groupChats, empty: "" },
    { label: "Direct Messages", items: directMessages, empty: "Use the orange pencil to message a teammate." },
  ];
  // A deal chat reads "Borrower · Address"; the address is what people look for, so lead with it.
  const displayTitle = (r: { kind: string; title: string }) => {
    if (r.kind !== "deal") return r.title;
    const parts = r.title.split(" · ");
    return parts.length === 2 ? `${parts[1]} · ${parts[0]}` : r.title;
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Team Chat</h1>
        <p className="text-sm text-muted-foreground">Internal only. Borrowers never see anything here.</p>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
        <div className={cn("space-y-4", room && "hidden md:block")}>
          <NewChatDialog currentUserId={me.id} />
          {sections.map((section) => (
            <section key={section.label} className="space-y-1.5">
              <h2 className="px-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{section.label}</h2>
              {section.items.length === 0 ? (
                section.empty && <p className="px-1 text-xs text-muted-foreground">{section.empty}</p>
              ) : (
                <ul className="space-y-1">
                  {section.items.map((r) => (
                    <li key={r.roomId}>
                      <Link
                        href={`/team-chat?room=${r.roomId}`}
                        className={cn(
                          "block rounded-md border px-3 py-2 text-sm hover:bg-muted/50",
                          r.roomId === activeId && "border-primary bg-primary/5"
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">{displayTitle(r)}</span>
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
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
        <div className={cn("space-y-2", !room && "hidden md:block")}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link href="/team-chat" className="text-sm text-primary md:hidden">
                ‹ All chats
              </Link>
              <h2 className="text-sm font-semibold">{active ? displayTitle(active) : "General"}</h2>
            </div>
            {active?.kind === "deal" && active.dealId && (
              <Button asChild size="sm" variant="outline">
                <Link href={`/deals/${active.dealId}`}>
                  <ExternalLink className="size-3.5" />
                  Go to deal
                </Link>
              </Button>
            )}
          </div>
          <TeamChatPanel
            key={activeId}
            roomId={activeId}
            showMembers={active?.kind !== "general" && active?.kind !== "dm"}
            phoneTitle={active ? displayTitle(active) : "General"}
            backHref="/team-chat"
            heightClass="h-[calc(100dvh-13rem)] min-h-[360px] md:h-[calc(100vh-14rem)] md:min-h-[420px]"
          />
        </div>
      </div>
    </div>
  );
}
