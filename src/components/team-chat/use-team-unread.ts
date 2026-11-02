"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getSoundPrefsCached } from "@/lib/sound-prefs-client";
import { getChatRooms, type ChatRoomSummary } from "@/server/actions/team-chat";
import { playSound } from "@/lib/notification-sound";
import { GLOBAL_CHAT_CHANNEL, getRealtimeClient } from "@/lib/realtime";
import { useVisibleInterval } from "@/lib/use-visible-interval";

/** Internal chat rooms with their unread counts, kept fresh (live when Realtime is on, polled otherwise); plays the chat sound on new messages. */
export function useTeamUnread() {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);
  const [rooms, setRooms] = useState<ChatRoomSummary[]>([]);
  const prevUnread = useRef<number | null>(null);

  const load = useCallback(
    () =>
      Promise.all([getChatRooms(true), getSoundPrefsCached()])
        .then(([r, prefs]) => {
          if (prevUnread.current !== null && r.totalUnread > prevUnread.current && prefs.soundChat) playSound("chat");
          prevUnread.current = r.totalUnread;
          setUnread(r.totalUnread);
          setRooms(r.rooms);
        })
        .catch(() => {}),
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

  return { unread, rooms, reload: load };
}
