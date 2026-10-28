"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export interface TeamDockWindow {
  roomId: string;
  title: string;
  kind: "general" | "group" | "deal" | "dm";
  dealId: string | null;
  minimized: boolean;
}

type OpenRoomInput = Omit<TeamDockWindow, "minimized">;

interface TeamDockContextValue {
  windows: TeamDockWindow[];
  openRoom: (w: OpenRoomInput) => void;
  closeRoom: (roomId: string) => void;
  minimizeRoom: (roomId: string) => void;
  restoreRoom: (roomId: string) => void;
  /** Unread count across every internal room, published by the dock so other parts of the page (the menu) can badge it. */
  unread: number;
  setUnread: (n: number) => void;
}

const TeamDockContext = createContext<TeamDockContextValue | null>(null);

/**
 * Open internal chats (direct messages, groups, deal rooms), floating at the bottom-right like Messenger.
 * Mounted once in the app layout so a chat stays open while you move between pages. In memory only:
 * a hard refresh closing them is a fine trade for not persisting stale window state.
 */
export function TeamDockProvider({ children }: { children: ReactNode }) {
  const [windows, setWindows] = useState<TeamDockWindow[]>([]);
  const [unread, setUnread] = useState(0);

  const openRoom = useCallback((w: OpenRoomInput) => {
    setWindows((prev) =>
      prev.some((x) => x.roomId === w.roomId)
        ? prev.map((x) => (x.roomId === w.roomId ? { ...x, minimized: false } : x))
        : [...prev, { ...w, minimized: false }]
    );
  }, []);
  const closeRoom = useCallback((roomId: string) => setWindows((prev) => prev.filter((x) => x.roomId !== roomId)), []);
  const minimizeRoom = useCallback(
    (roomId: string) => setWindows((prev) => prev.map((x) => (x.roomId === roomId ? { ...x, minimized: true } : x))),
    []
  );
  const restoreRoom = useCallback(
    (roomId: string) => setWindows((prev) => prev.map((x) => (x.roomId === roomId ? { ...x, minimized: false } : x))),
    []
  );

  return <TeamDockContext.Provider value={{ windows, openRoom, closeRoom, minimizeRoom, restoreRoom, unread, setUnread }}>{children}</TeamDockContext.Provider>;
}

export function useTeamDock() {
  const ctx = useContext(TeamDockContext);
  if (!ctx) throw new Error("useTeamDock must be used within a TeamDockProvider");
  return ctx;
}
