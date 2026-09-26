"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";
import {
  getRoomState,
  markRoomRead,
  sendTeamMessage,
  type ChatMessage,
  type ChatRoomState,
} from "@/server/actions/team-chat";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RoomMembersDialog } from "@/components/team-chat/room-members-dialog";
import { cn } from "@/lib/utils";
import { GLOBAL_CHAT_CHANNEL, getRealtimeClient, roomChannelName } from "@/lib/realtime";

// Live updates come over Supabase Realtime; polling is only a safety net (and
// the whole mechanism if Realtime isn't configured).
const POLL_LIVE_MS = 30_000;
const POLL_FALLBACK_MS = 4_000;
const TYPING_TTL_MS = 4_000;

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === today.toDateString() ? time : `${d.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}

function Composer({
  placeholder,
  onSend,
  onTyping,
  autoFocus,
}: {
  placeholder: string;
  onSend: (text: string) => Promise<void>;
  onTyping?: () => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const value = text.trim();
    if (!value) return;
    startTransition(async () => {
      try {
        await onSend(value);
        setText("");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't send that");
      }
    });
  }

  return (
    <div className="flex items-end gap-2">
      <Textarea
        value={text}
        rows={1}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          if (e.target.value) onTyping?.();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        className="min-h-9 resize-none"
      />
      <Button type="button" size="sm" disabled={pending || !text.trim()} onClick={submit}>
        Send
      </Button>
    </div>
  );
}

function MessageRow({ m, mine, compact }: { m: ChatMessage; mine: boolean; compact?: boolean }) {
  return (
    <div className={cn("flex gap-2.5", compact && "gap-2")}>
      <Avatar className={compact ? "size-6" : "size-8"}>
        <AvatarImage src={m.authorImage ?? undefined} alt="" />
        <AvatarFallback>{m.authorName[0] ?? "?"}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{mine ? "You" : m.authorName}</span> · {timeLabel(m.createdAt)}
        </p>
        <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
      </div>
    </div>
  );
}

/**
 * The internal team chat for one room (General, or a single deal). Polls
 * every few seconds while open, marks the room read as messages arrive, and
 * shows replies as threads. Purely internal — nothing here reaches a borrower.
 */
export function TeamChatPanel({
  roomId,
  heightClass = "h-[560px]",
  showMembers = true,
}: {
  roomId: string;
  heightClass?: string;
  showMembers?: boolean;
}) {
  const [state, setState] = useState<ChatRoomState | null>(null);
  const [openThread, setOpenThread] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  const [typing, setTyping] = useState<Record<string, { name: string; until: number }>>({});
  const [live, setLive] = useState(false);
  const channelRef = useRef<ReturnType<NonNullable<ReturnType<typeof getRealtimeClient>>["channel"]> | null>(null);
  const lastTypingSent = useRef(0);
  const lastReadSent = useRef(new Date(0));

  const refresh = useCallback(async () => {
    try {
      const next = await getRoomState(roomId);
      setState(next);
      if (!document.hidden) {
        const unreadFromOthers = next.messages.some(
          (m) => m.userId !== next.currentUserId && new Date(m.createdAt) > lastReadSent.current
        );
        await markRoomRead(roomId);
        if (unreadFromOthers) {
          lastReadSent.current = new Date();
          void channelRef.current?.send({ type: "broadcast", event: "changed", payload: {} });
        }
      }
    } catch {
      // transient — the next poll retries
    }
  }, [roomId]);

  // Realtime: another person's message/read means "refetch now"; typing
  // events drive the "is typing…" line.
  useEffect(() => {
    const rt = getRealtimeClient();
    if (!rt) return;
    const channel = rt.channel(roomChannelName(roomId), { config: { broadcast: { self: false } } });
    channel
      .on("broadcast", { event: "changed" }, () => void refresh())
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const { userId, name } = payload as { userId: string; name: string };
        setTyping((prev) => ({ ...prev, [userId]: { name, until: Date.now() + TYPING_TTL_MS } }));
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    channelRef.current = channel;
    return () => {
      channelRef.current = null;
      setLive(false);
      void rt.removeChannel(channel);
    };
  }, [roomId, refresh]);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, live ? POLL_LIVE_MS : POLL_FALLBACK_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [refresh, live]);

  // Expire stale typing indicators.
  useEffect(() => {
    const t = setInterval(() => {
      setTyping((prev) => {
        const now = Date.now();
        const next = Object.fromEntries(Object.entries(prev).filter(([, v]) => v.until > now));
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  const { topLevel, replies } = useMemo(() => {
    const top: ChatMessage[] = [];
    const rep = new Map<string, ChatMessage[]>();
    for (const m of state?.messages ?? []) {
      if (m.parentId) rep.set(m.parentId, [...(rep.get(m.parentId) ?? []), m]);
      else top.push(m);
    }
    return { topLevel: top, replies: rep };
  }, [state]);

  // Scroll to the newest message when new ones arrive.
  useEffect(() => {
    const n = state?.messages.length ?? 0;
    if (n !== lastCount.current) {
      lastCount.current = n;
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
  }, [state]);

  const typingNames = Object.values(typing).map((t) => t.name.split(" ")[0]);

  // "Seen by": everyone else whose read marker is at/after my latest top-level message.
  const myLast = [...(state?.messages ?? [])].reverse().find((m) => m.userId === state?.currentUserId);
  const seenBy = myLast
    ? (state?.readers ?? [])
        .filter((r) => r.userId !== state?.currentUserId && new Date(r.lastReadAt) >= new Date(myLast.createdAt))
        .map((r) => r.name.split(" ")[0])
    : [];

  function broadcastChanged() {
    void channelRef.current?.send({ type: "broadcast", event: "changed", payload: {} });
    const rt = getRealtimeClient();
    if (rt) {
      // Lights up the top-bar unread count for everyone else right away.
      const g = rt.channel(GLOBAL_CHAT_CHANNEL);
      g.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void g.send({ type: "broadcast", event: "changed", payload: {} }).finally(() => void rt.removeChannel(g));
        }
      });
    }
  }

  async function send(text: string, parentId: string | null = null) {
    await sendTeamMessage(roomId, text, parentId);
    broadcastChanged();
    await refresh();
  }

  function announceTyping() {
    const now = Date.now();
    if (now - lastTypingSent.current < 2000 || !state) return;
    lastTypingSent.current = now;
    const me = state.readers.find((r) => r.userId === state.currentUserId)?.name ?? state.messages.find((m) => m.userId === state.currentUserId)?.authorName ?? "Someone";
    void channelRef.current?.send({ type: "broadcast", event: "typing", payload: { userId: state.currentUserId, name: me } });
  }

  if (!state) return <div className={cn("flex items-center justify-center text-sm text-muted-foreground", heightClass)}>Loading chat…</div>;

  return (
    <div className={cn("flex flex-col rounded-md border", heightClass)}>
      {showMembers && (
        <div className="flex justify-end border-b px-3 py-2">
          <RoomMembersDialog roomId={roomId} />
        </div>
      )}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {topLevel.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
            <MessageSquare className="size-6" />
            No messages yet. Say something to the team.
          </div>
        )}
        {topLevel.map((m) => {
          const thread = replies.get(m.id) ?? [];
          const isOpen = openThread === m.id;
          return (
            <div key={m.id} className="space-y-2">
              <MessageRow m={m} mine={m.userId === state.currentUserId} />
              <div className="pl-10">
                <button
                  type="button"
                  className="text-xs text-primary hover:underline"
                  onClick={() => setOpenThread(isOpen ? null : m.id)}
                >
                  {thread.length > 0 ? `${thread.length} ${thread.length === 1 ? "reply" : "replies"}` : "Reply"}
                </button>
                {(isOpen || thread.length > 0) && (
                  <div className="mt-2 space-y-2 border-l-2 pl-3">
                    {thread.map((r) => (
                      <MessageRow key={r.id} m={r} mine={r.userId === state.currentUserId} compact />
                    ))}
                    {isOpen && <Composer placeholder="Reply in thread…" autoFocus onSend={(t) => send(t, m.id)} onTyping={announceTyping} />}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {seenBy.length > 0 && <p className="text-right text-[11px] text-muted-foreground">Seen by {seenBy.join(", ")}</p>}
        <div ref={bottomRef} />
      </div>
      <div className="border-t p-3">
        {typingNames.length > 0 && (
          <p className="mb-1.5 text-xs text-muted-foreground">
            {typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"} typing…
          </p>
        )}
        <Composer
          placeholder="Message the team (internal only — clients never see this)"
          onSend={(t) => send(t)}
          onTyping={announceTyping}
        />
      </div>
    </div>
  );
}
