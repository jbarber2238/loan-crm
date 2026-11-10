"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getSoundPrefsCached } from "@/lib/sound-prefs-client";
import { getChatRooms, type ChatRoomSummary } from "@/server/actions/team-chat";
import { playSound } from "@/lib/notification-sound";
import { GLOBAL_CHAT_CHANNEL, getRealtimeClient } from "@/lib/realtime";
import { useVisibleInterval } from "@/lib/use-visible-interval";

/**
 * Internal chat rooms with their unread counts, kept fresh (live when Realtime is on, polled otherwise); plays the chat
 * sound on new messages. `onArrival` is called once for each room that has gained unread messages since the last look
 * (never for what was already unread when the page loaded; `loaded` tells you that first look is done).
 */
export function useTeamUnread({
  onArrival,
  onFirstLoad,
}: { onArrival?: (room: ChatRoomSummary) => void; onFirstLoad?: (totalUnread: number) => void } = {}) {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const [rooms, setRooms] = useState<ChatRoomSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const prevUnread = useRef<number | null>(null);
  const prevByRoom = useRef<Map<string, number> | null>(null);
  const arrival = useRef(onArrival);
  const firstLoad = useRef(onFirstLoad);
  useEffect(() => {
    arrival.current = onArrival;
    firstLoad.current = onFirstLoad;
  });

  const load = useCallback(
    () =>
      Promise.all([getChatRooms(true), getSoundPrefsCached()])
        .then(([r, prefs]) => {
          if (prevUnread.current !== null && r.totalUnread > prevUnread.current && prefs.soundChat) playSound("chat");
          prevUnread.current = r.totalUnread;
          const before = prevByRoom.current;
          prevByRoom.current = new Map(r.rooms.map((room) => [room.roomId, room.unread]));
          if (before) {
            for (const room of r.rooms) if (room.unread > (before.get(room.roomId) ?? 0)) arrival.current?.(room);
          } else {
            firstLoad.current?.(r.totalUnread);
          }
          setUnread(r.totalUnread);
          setRooms(r.rooms);
          setLoaded(true);
          return r.totalUnread;
        })
        .catch(() => undefined),
    []
  );

  useEffect(() => {
    void load();
    const rt = getRealtimeClient();
    const channel = rt?.channel(GLOBAL_CHAT_CHANNEL).on("broadcast", { event: "changed" }, () => void load()).subscribe();
    return () => {
      if (rt && channel) void rt.removeChannel(channel);
    };
  }, [load, pathname]);
  // Live when Realtime is on (a push triggers a refetch); without it, look more often.
  useVisibleInterval(load, getRealtimeClient() ? 30_000 : 8_000);

  return { unread, rooms, loaded, reload: load };
}
