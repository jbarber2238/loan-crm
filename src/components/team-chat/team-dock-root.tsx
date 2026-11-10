"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TeamDockWindow } from "@/components/team-chat/team-dock-window";
import { TeamNewMessage } from "@/components/team-chat/team-new-message";
import { TeamMessageToasts, type TeamToast } from "@/components/team-chat/team-message-toasts";
import { TeamUnreadPanel } from "@/components/team-chat/team-unread-panel";
import { useTeamDock } from "@/components/team-chat/team-dock-context";
import { useTeamUnread } from "@/components/team-chat/use-team-unread";
import { isPersonalMessage } from "@/lib/team-chat-alerts";
import type { ChatRoomSummary } from "@/server/actions/team-chat";
import { cn } from "@/lib/utils";

// The unread panel opens by itself at most once per half hour per browser tab (so a refresh doesn't keep reopening
// it), and again whenever someone returns to the CRM after being away at least this long.
const PANEL_THROTTLE_MS = 30 * 60_000;
const AWAY_MS = 5 * 60_000;
const PANEL_SEEN_KEY = "teamUnreadPanelShownAt";

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/**
 * Messenger-style dock for internal team chat, mounted once in the app layout. Open chats float
 * immediately left of the pencil (new message) button; minimized ones stack above it as name pills.
 * Team messages are hard to miss here on purpose: a new one rises as a preview above the button, a minimized
 * chat's pill swells and turns orange, the button itself grows a label and pulses while anything is unread, and
 * logging in (or coming back after a while away) opens a list of what's waiting.
 */
export function TeamDockRoot({ currentUserId, currentUserName }: { currentUserId: string; currentUserName: string }) {
  const { windows, openRoom, closeRoom, minimizeRoom, restoreRoom, setUnread } = useTeamDock();
  const [composeOpen, setComposeOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [toasts, setToasts] = useState<TeamToast[]>([]);
  // Bumped on every new message so the pill / button animation plays again each time.
  const [swell, setSwell] = useState<Record<string, number>>({});
  const [buttonSwell, setButtonSwell] = useState(0);
  const [tabVisible, setTabVisible] = useState(true);

  const windowsRef = useRef(windows);
  useEffect(() => {
    windowsRef.current = windows;
  });

  const showPanel = useCallback(() => {
    setComposeOpen(false);
    setToasts([]);
    setPanelOpen(true);
    try {
      sessionStorage.setItem(PANEL_SEEN_KEY, String(Date.now()));
    } catch {
      // Private mode: the panel may open again on the next refresh, which is harmless.
    }
  }, []);

  const onArrival = useCallback(
    (room: ChatRoomSummary) => {
      setSwell((prev) => ({ ...prev, [room.roomId]: (prev[room.roomId] ?? 0) + 1 }));
      setButtonSwell((n) => n + 1);
      const w = windowsRef.current.find((x) => x.roomId === room.roomId);
      // Open and on screen: they're reading it. Minimized: the swelling orange pill is the cue, no preview on top of it.
      if (w && (!w.minimized ? document.visibilityState === "visible" : true)) return;
      const last = room.lastMessage;
      const author = last?.authorName ?? "Someone";
      const next: TeamToast = {
        roomId: room.roomId,
        heading: room.kind === "dm" ? author : `${firstName(author)} in ${room.title}`,
        body: last?.body ?? "",
        count: room.unread,
        sticky: isPersonalMessage(room, last?.body ?? "", { id: currentUserId, name: currentUserName }),
        stamp: Date.now(),
      };
      setToasts((prev) => [...prev.filter((t) => t.roomId !== room.roomId), next].slice(-3));
    },
    [currentUserId, currentUserName]
  );

  // On logging in (the dock mounts once per page load): open what's waiting, unless it was just shown.
  const onFirstLoad = useCallback(
    (total: number) => {
      if (total === 0) return;
      let last = 0;
      try {
        last = Number(sessionStorage.getItem(PANEL_SEEN_KEY)) || 0;
      } catch {
        // Treated as never shown.
      }
      if (Date.now() - last > PANEL_THROTTLE_MS) showPanel();
    },
    [showPanel]
  );

  const { unread, rooms, reload } = useTeamUnread({ onArrival, onFirstLoad });
  useEffect(() => setUnread(unread), [unread, setUnread]);

  useEffect(() => {
    const onVis = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);


  // Coming back after being away: look again, and open what's waiting.
  useEffect(() => {
    let hiddenAt: number | null = null;
    const onVis = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt !== null && Date.now() - hiddenAt >= AWAY_MS;
      hiddenAt = null;
      if (away) void reload().then((n) => n && showPanel());
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [reload, showPanel]);

  const expanded = windows.filter((w) => !w.minimized);
  const minimized = windows.filter((w) => w.minimized);
  const unreadByRoom = new Map(rooms.map((r) => [r.roomId, r.unread]));
  // A preview goes away once its chat has been read (here or on another device) or opened.
  const openIds = new Set(expanded.map((w) => w.roomId));
  const shownToasts = toasts.filter((t) => (unreadByRoom.get(t.roomId) ?? 0) > 0 && !openIds.has(t.roomId));

  function openFromSummary(r: ChatRoomSummary) {
    openRoom({ roomId: r.roomId, title: r.title, kind: r.kind, dealId: r.dealId });
    setToasts((prev) => prev.filter((t) => t.roomId !== r.roomId));
    setPanelOpen(false);
  }

  return (
    <div className="fixed right-3 bottom-0 z-40 flex items-end gap-3 sm:right-4">
      {/* On a phone only the newest open chat shows, so panels never run off the screen. */}
      {expanded.map((w, i) => (
        <div key={w.roomId} className={i === expanded.length - 1 ? "" : "hidden sm:block"}>
          <TeamDockWindow w={w} onClose={() => closeRoom(w.roomId)} onMinimize={() => minimizeRoom(w.roomId)} />
        </div>
      ))}

      <div className="flex flex-col items-end gap-2 pb-4 max-lg:pb-[calc(1rem+var(--bottom-bar,0px))]">
        <TeamMessageToasts
          toasts={shownToasts}
          visible={tabVisible}
          onOpen={(roomId) => {
            const r = rooms.find((x) => x.roomId === roomId);
            if (r) openFromSummary(r);
          }}
          onDismiss={(roomId) => setToasts((prev) => prev.filter((t) => t.roomId !== roomId))}
        />
        {minimized.map((w) => {
          const n = unreadByRoom.get(w.roomId) ?? 0;
          const pulses = swell[w.roomId] ?? 0;
          return (
            <button
              // A new key per message restarts the swell; with nothing new yet there's no animation to replay.
              key={`${w.roomId}:${pulses}`}
              type="button"
              onClick={() => restoreRoom(w.roomId)}
              className={cn(
                "flex max-w-52 origin-bottom-right items-center gap-2 rounded-full border py-1.5 pr-1.5 pl-3 shadow-lg",
                pulses > 0 && n > 0 && "animate-chat-swell",
                n > 0 ? "border-[#fa5f05] bg-[#fa5f05] text-[#0b0c0d] hover:bg-[#ff7a2e]" : "bg-popover hover:bg-muted"
              )}
            >
              <span className="min-w-0 text-left">
                <span className={`block truncate text-xs ${n > 0 ? "font-bold" : "font-semibold"}`}>{w.title}</span>
                <span className={cn("block truncate text-[10px]", n > 0 ? "text-[#0b0c0d]/75" : "text-muted-foreground")}>
                  {n > 0 ? (n === 1 ? "1 new message" : `${n} new messages`) : "Team chat"}
                </span>
              </span>
              {n > 0 && <span className="rounded-full bg-[#0b0c0d] px-1.5 text-[10px] leading-4 font-semibold text-white">{n}</span>}
            </button>
          );
        })}
        <div key={`button:${buttonSwell}`} className={cn("relative origin-bottom-right", buttonSwell > 0 && unread > 0 && "animate-chat-swell")}>
          <Button
            type="button"
            size={unread > 0 ? "lg" : "icon-lg"}
            className={cn(
              "rounded-full shadow-lg",
              unread > 0 && "animate-chat-ring h-11 gap-2 bg-[#fa5f05] px-4 text-[#0b0c0d] hover:bg-[#ff7a2e]"
            )}
            onClick={() => {
              setPanelOpen(false);
              setComposeOpen((v) => !v);
            }}
            aria-label={unread > 0 ? `Team messages (${unread} unread)` : "Team messages"}
          >
            <Pencil className="size-5" />
            {unread > 0 && <span className="text-sm font-bold">{unread} unread</span>}
          </Button>
        </div>
      </div>

      {composeOpen && <TeamNewMessage rooms={rooms} currentUserId={currentUserId} onClose={() => setComposeOpen(false)} />}
      {panelOpen && <TeamUnreadPanel rooms={rooms} onOpen={openFromSummary} onClose={() => setPanelOpen(false)} />}
    </div>
  );
}
