"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TeamDockWindow } from "@/components/team-chat/team-dock-window";
import { TeamNewMessage } from "@/components/team-chat/team-new-message";
import { useTeamDock } from "@/components/team-chat/team-dock-context";
import { useTeamUnread } from "@/components/team-chat/use-team-unread";

/**
 * Messenger-style dock for internal team chat, mounted once in the app layout. Open chats float
 * immediately left of the pencil (new message) button; minimized ones stack above it as name pills.
 * The pencil carries the unread count for every internal room.
 */
export function TeamDockRoot({ currentUserId }: { currentUserId: string }) {
  const { windows, closeRoom, minimizeRoom, restoreRoom } = useTeamDock();
  const { unread, rooms } = useTeamUnread();
  const [composeOpen, setComposeOpen] = useState(false);

  const expanded = windows.filter((w) => !w.minimized);
  const minimized = windows.filter((w) => w.minimized);
  const unreadByRoom = new Map(rooms.map((r) => [r.roomId, r.unread]));

  return (
    <div className="fixed right-3 bottom-0 z-40 flex items-end gap-3 sm:right-4">
      {/* On a phone only the newest open chat shows, so panels never run off the screen. */}
      {expanded.map((w, i) => (
        <div key={w.roomId} className={i === expanded.length - 1 ? "" : "hidden sm:block"}>
          <TeamDockWindow w={w} onClose={() => closeRoom(w.roomId)} onMinimize={() => minimizeRoom(w.roomId)} />
        </div>
      ))}

      <div className="flex flex-col items-end gap-2 pb-4 max-lg:pb-[calc(1rem+var(--bottom-bar,0px))]">
        {minimized.map((w) => {
          const n = unreadByRoom.get(w.roomId) ?? 0;
          return (
            <button
              key={w.roomId}
              type="button"
              onClick={() => restoreRoom(w.roomId)}
              className="flex max-w-52 items-center gap-2 rounded-full border bg-popover py-1.5 pr-1.5 pl-3 shadow-lg hover:bg-muted"
            >
              <span className="min-w-0 text-left">
                <span className={`block truncate text-xs ${n > 0 ? "font-bold" : "font-semibold"}`}>{w.title}</span>
                <span className="block truncate text-[10px] text-muted-foreground">Team chat</span>
              </span>
              {n > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] leading-4 font-semibold text-primary-foreground">{n}</span>}
            </button>
          );
        })}
        <div className="relative">
          <Button
            type="button"
            size="icon-lg"
            className="rounded-full shadow-lg"
            onClick={() => setComposeOpen((v) => !v)}
            aria-label={unread > 0 ? `Team messages (${unread} unread)` : "Team messages"}
          >
            <Pencil className="size-5" />
          </Button>
          {unread > 0 && (
            <span className="pointer-events-none absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] leading-5 font-semibold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </div>
      </div>

      {composeOpen && <TeamNewMessage rooms={rooms} currentUserId={currentUserId} onClose={() => setComposeOpen(false)} />}
    </div>
  );
}
