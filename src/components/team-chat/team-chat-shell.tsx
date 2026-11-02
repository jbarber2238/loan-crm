"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewChatDialog } from "@/components/team-chat/new-chat-dialog";
import { TeamChatPanel, prefetchRoomState } from "@/components/team-chat/team-chat-panel";
import { RoomActions } from "@/components/team-chat/room-actions";
import { RoomMembersDialog } from "@/components/team-chat/room-members-dialog";
import type { ChatRoomSummary, ManageableGroupChat } from "@/server/actions/team-chat";
import { cn } from "@/lib/utils";

// A deal chat reads "Borrower · Address"; the address is what people look for, so lead with it.
const displayTitle = (r: { kind: string; title: string }) => {
  if (r.kind !== "deal") return r.title;
  const parts = r.title.split(" · ");
  return parts.length === 2 ? `${parts[1]} · ${parts[0]}` : r.title;
};

/**
 * The Team Chat page. Picking a chat only changes the address (the page itself isn't fetched again from the
 * server), and the first messages of the busiest chats are loaded in the background, so a chat opens right away.
 */
export function TeamChatShell({
  currentUserId,
  rooms,
  generalId,
  otherGroups,
}: {
  currentUserId: string;
  rooms: ChatRoomSummary[];
  generalId: string;
  otherGroups: ManageableGroupChat[];
}) {
  const searchParams = useSearchParams();
  const room = searchParams.get("room");
  const activeId = rooms.some((r) => r.roomId === room) ? room! : generalId;
  const active = rooms.find((r) => r.roomId === activeId);
  // Chats opened here are read by the time they show, so their unread badge goes away without waiting for a refresh.
  const [opened, setOpened] = useState<Set<string>>(new Set());
  // Once someone opens a chat, stop loading others ahead of time so theirs isn't queued behind them.
  const stopPrefetch = useRef(false);
  const unreadOf = (r: ChatRoomSummary) => (opened.has(r.roomId) ? 0 : r.unread);

  // Load the first messages of the chats most likely to be opened next, one at a time so the database isn't hit all at once.
  useEffect(() => {
    let cancelled = false;
    const ranked = [...rooms].sort((a, b) => b.unread - a.unread).slice(0, 4);
    (async () => {
      for (const [i, r] of ranked.entries()) {
        // The first one starts right away (it also wakes the server up); the rest follow at a gentle pace.
        if (i > 0) await new Promise((resolve) => setTimeout(resolve, 400));
        if (cancelled || stopPrefetch.current) return;
        if (!document.hidden) await prefetchRoomState(r.roomId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rooms]);

  function openRoom(e: React.MouseEvent, roomId: string | null) {
    // Let "open in a new tab" clicks behave normally.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    stopPrefetch.current = true;
    if (roomId) setOpened((prev) => new Set(prev).add(roomId));
    window.history.pushState(null, "", roomId ? `/team-chat?room=${roomId}` : "/team-chat");
  }

  const activeLoans = rooms.filter((r) => r.kind === "deal" && r.lastMessage);
  const groupChats = [...rooms.filter((r) => r.kind === "general"), ...rooms.filter((r) => r.kind === "group")];
  const directMessages = rooms.filter((r) => r.kind === "dm");
  const sections = useMemo(
    () => [
      { label: "Active Loans", items: activeLoans, empty: "Chats started on a loan show up here." },
      { label: "Group Team Chats", items: groupChats, empty: "" },
      { label: "Direct Messages", items: directMessages, empty: "Use the orange pencil to message a teammate." },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rooms]
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Team Chat</h1>
        <p className="text-sm text-muted-foreground">Internal only. Borrowers never see anything here.</p>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
        <div className={cn("space-y-4", room && "hidden md:block")}>
          <NewChatDialog currentUserId={currentUserId} />
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
                        onClick={(e) => openRoom(e, r.roomId)}
                        onPointerDown={() => void prefetchRoomState(r.roomId)}
                        onMouseEnter={() => void prefetchRoomState(r.roomId)}
                        className={cn(
                          "block rounded-md border px-3 py-2 text-sm hover:bg-muted/50",
                          r.roomId === activeId && "border-primary bg-primary/5"
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">{displayTitle(r)}</span>
                          {unreadOf(r) > 0 && (
                            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                              {unreadOf(r)}
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
          {otherGroups.length > 0 && (
            <section className="space-y-1.5">
              <h2 className="px-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">Other group chats (admin)</h2>
              <p className="px-1 text-xs text-muted-foreground">Group chats you aren&apos;t in. You can manage them, but not read them.</p>
              <ul className="space-y-1">
                {otherGroups.map((g) => (
                  <li key={g.roomId} className="space-y-2 rounded-md border px-3 py-2 text-sm">
                    <div>
                      <p className="truncate font-medium">{g.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {g.memberNames.join(", ") || "No members"}
                        {g.createdByName ? ` · started by ${g.createdByName}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <RoomActions roomId={g.roomId} name={g.name} kind="group" canRename canDelete />
                      <RoomMembersDialog roomId={g.roomId} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
        <div className={cn("space-y-2", !room && "hidden md:block")}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link href="/team-chat" onClick={(e) => openRoom(e, null)} className="text-sm text-primary md:hidden">
                ‹ All chats
              </Link>
              <h2 className="text-sm font-semibold">{active ? displayTitle(active) : "General"}</h2>
            </div>
            {active && (active.kind === "group" || active.kind === "dm") && active.canManage && (
              <div className="flex items-center gap-1.5">
                <RoomActions roomId={active.roomId} name={displayTitle(active)} kind={active.kind} canRename={active.kind === "group"} canDelete />
              </div>
            )}
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
            onBack={() => window.history.pushState(null, "", "/team-chat")}
            heightClass="h-[calc(100dvh-13rem)] min-h-[360px] md:h-[calc(100vh-14rem)] md:min-h-[420px]"
          />
        </div>
      </div>
    </div>
  );
}
