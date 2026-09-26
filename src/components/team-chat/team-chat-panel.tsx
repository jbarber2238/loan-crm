"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { FileText, MessageSquare, Mic, Paperclip, Square, X } from "lucide-react";
import {
  getRoomState,
  markRoomRead,
  sendTeamMessage,
  type ChatAttachment,
  type ChatMessage,
  type ChatRoomState,
} from "@/server/actions/team-chat";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useVoiceRecorder, type VoiceClip } from "@/components/messaging/use-voice-recorder";
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

export interface OutgoingMessage {
  text: string;
  files: File[];
  clip: VoiceClip | null;
}

function formatDuration(totalSeconds: number): string {
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function Composer({
  placeholder,
  onSend,
  onTyping,
  autoFocus,
}: {
  placeholder: string;
  onSend: (message: OutgoingMessage) => Promise<void>;
  onTyping?: () => void;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [clip, setClip] = useState<VoiceClip | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const voice = useVoiceRecorder();

  const canSend = Boolean(text.trim() || files.length || clip);

  function submit() {
    if (!canSend || voice.recording) return;
    startTransition(async () => {
      try {
        await onSend({ text: text.trim(), files, clip });
        setText("");
        setFiles([]);
        setClip(null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't send that");
      }
    });
  }

  async function toggleRecording() {
    if (voice.recording) {
      setClip(await voice.stop());
      return;
    }
    try {
      await voice.start();
    } catch (err) {
      toast.error(err instanceof Error && err.name === "NotAllowedError" ? "Allow microphone access to record" : "Couldn't start recording");
    }
  }

  return (
    <div className="space-y-2">
      {(files.length > 0 || clip) && (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 text-xs">
              <Paperclip className="size-3" />
              <span className="max-w-40 truncate">{f.name}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, n) => n !== i))}>
                <X className="size-3" />
              </button>
            </span>
          ))}
          {clip && (
            <div className="w-full space-y-1 rounded-md border bg-muted/40 p-2 text-xs">
              <div className="flex items-center gap-2">
                <Mic className="size-3" />
                Voice clip · {formatDuration(clip.seconds)}
                <button type="button" aria-label="Remove voice clip" className="ml-auto" onClick={() => setClip(null)}>
                  <X className="size-3" />
                </button>
              </div>
              <Textarea
                value={clip.transcript}
                rows={2}
                placeholder="Transcript (edit if it got a word wrong)"
                onChange={(e) => setClip({ ...clip, transcript: e.target.value })}
                className="text-xs"
              />
            </div>
          )}
        </div>
      )}
      {voice.recording && (
        <p className="flex items-center gap-2 text-xs text-red-600">
          <span className="size-2 animate-pulse rounded-full bg-red-600" />
          Recording… {formatDuration(voice.seconds)} — tap the mic again to stop
        </p>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            setFiles([...files, ...Array.from(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <Button type="button" size="icon-sm" variant="ghost" title="Attach a file" aria-label="Attach a file" onClick={() => fileInput.current?.click()}>
          <Paperclip className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant={voice.recording ? "destructive" : "ghost"}
          title={voice.recording ? "Stop recording" : "Record a voice clip"}
          aria-label={voice.recording ? "Stop recording" : "Record a voice clip"}
          onClick={toggleRecording}
        >
          {voice.recording ? <Square className="size-4" /> : <Mic className="size-4" />}
        </Button>
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
        <Button type="button" size="sm" disabled={pending || voice.recording || !canSend} onClick={submit}>
          {pending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}

function Attachments({ items }: { items: ChatAttachment[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-2">
      {items.map((a) => {
        const src = `/api/team-chat/attachments/${a.id}`;
        if (a.kind === "audio") {
          return (
            <div key={a.id} className="max-w-sm space-y-1 rounded-md border bg-muted/30 p-2">
              <audio controls preload="none" src={src} className="h-9 w-full" />
              {a.transcript ? (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">Transcript:</span> {a.transcript}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">No transcript</p>
              )}
            </div>
          );
        }
        if (a.mimeType.startsWith("image/")) {
          return (
            <a key={a.id} href={src} target="_blank" rel="noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={a.fileName} className="max-h-64 max-w-xs rounded-md border object-contain" />
            </a>
          );
        }
        return (
          <a
            key={a.id}
            href={src}
            target="_blank"
            rel="noreferrer"
            className="flex max-w-sm items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm hover:bg-muted/60"
          >
            <FileText className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{a.fileName}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{Math.max(1, Math.round(a.fileSize / 1024))} KB</span>
          </a>
        );
      })}
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
        {m.body && <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>}
        <Attachments items={m.attachments} />
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

  async function send(message: OutgoingMessage, parentId: string | null = null) {
    const form = new FormData();
    form.set("body", message.text);
    if (parentId) form.set("parentId", parentId);
    for (const f of message.files) form.append("file", f);
    if (message.clip) {
      form.set("audio", message.clip.file);
      form.set("audioTranscript", message.clip.transcript);
      form.set("audioSeconds", String(message.clip.seconds));
    }
    await sendTeamMessage(roomId, form);
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
                    {isOpen && <Composer placeholder="Reply in thread…" autoFocus onSend={(msg) => send(msg, m.id)} onTyping={announceTyping} />}
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
          onSend={(msg) => send(msg)}
          onTyping={announceTyping}
        />
      </div>
    </div>
  );
}
