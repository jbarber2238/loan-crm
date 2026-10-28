"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUp, ChevronLeft, FileText, MessageSquare, Mic, Paperclip, SmilePlus, Square, X } from "lucide-react";
import {
  getRoomState,
  markRoomRead,
  sendTeamMessage,
  toggleTeamReaction,
  type ChatAttachment,
  type ChatMessage,
  type ChatReaction,
  type ChatRoomState,
} from "@/server/actions/team-chat";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { useVoiceRecorder, type VoiceClip } from "@/components/messaging/use-voice-recorder";
import { RoomMembersDialog } from "@/components/team-chat/room-members-dialog";
import { useLoanCenterNav } from "@/components/deals/loan-center-nav-context";
import { cn } from "@/lib/utils";
import { scrollToEnd } from "@/lib/scroll-to-end";
import { useFillViewport } from "@/lib/use-fill-viewport";
import { useIsPhone } from "@/lib/use-is-phone";
import { QUICK_REACTIONS, REACTION_GROUPS } from "@/lib/chat-reactions";
import { GLOBAL_CHAT_CHANNEL, getRealtimeClient, roomChannelName } from "@/lib/realtime";
import { stageLargeFiles } from "@/lib/stage-large-files";
import { stageUploadChunk } from "@/server/actions/staged-upload";

// Live updates come over Supabase Realtime; polling is only a safety net (and
// the whole mechanism if Realtime isn't configured).
const POLL_LIVE_MS = 30_000;
const POLL_FALLBACK_MS = 4_000;
const TYPING_TTL_MS = 4_000;


// ---- Phone: the chat takes the whole screen, like Messenger -------------------------------------

function subscribeViewport(callback: () => void) {
  const vv = window.visualViewport;
  window.addEventListener("resize", callback);
  vv?.addEventListener("resize", callback);
  vv?.addEventListener("scroll", callback);
  return () => {
    window.removeEventListener("resize", callback);
    vv?.removeEventListener("resize", callback);
    vv?.removeEventListener("scroll", callback);
  };
}
/** The part of the screen that's actually visible (shrinks when the keyboard opens), as "top|height". */
function useVisibleBox(): { top: number; height: number } {
  const raw = useSyncExternalStore(
    subscribeViewport,
    () => {
      const vv = window.visualViewport;
      return vv ? `${Math.round(vv.offsetTop)}|${Math.round(vv.height)}` : `0|${window.innerHeight}`;
    },
    () => "0|0"
  );
  const [top, height] = raw.split("|").map(Number);
  return { top, height };
}

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
  phone,
}: {
  placeholder: string;
  onSend: (message: OutgoingMessage) => Promise<void>;
  onTyping?: () => void;
  autoFocus?: boolean;
  /** Messenger-style: round text field, send arrow. */
  phone?: boolean;
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
          data-chat-phone={phone ? "" : undefined}
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
          className={cn("min-h-9 resize-none", phone && "max-h-32 min-h-10 rounded-3xl px-4 py-2")}
        />
        {phone ? (
          <Button
            type="button"
            size="icon"
            className="size-10 shrink-0 rounded-full"
            aria-label="Send"
            disabled={pending || voice.recording || !canSend}
            onClick={submit}
          >
            <ArrowUp className="size-5" />
          </Button>
        ) : (
          <Button type="button" size="sm" disabled={pending || voice.recording || !canSend} onClick={submit}>
            {pending ? "Sending…" : "Send"}
          </Button>
        )}
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

/** The reaction list after I tap `emoji` — same result the server will land on, shown immediately. */
function withToggledReaction(reactions: ChatReaction[], emoji: string, userId: string, name: string): ChatReaction[] {
  const existing = reactions.find((r) => r.emoji === emoji);
  if (!existing) return [...reactions, { emoji, userIds: [userId], names: [name] }];
  const i = existing.userIds.indexOf(userId);
  if (i === -1) {
    return reactions.map((r) => (r === existing ? { ...r, userIds: [...r.userIds, userId], names: [...r.names, name] } : r));
  }
  const userIds = existing.userIds.filter((_, n) => n !== i);
  if (userIds.length === 0) return reactions.filter((r) => r !== existing);
  return reactions.map((r) => (r === existing ? { ...r, userIds, names: r.names.filter((_, n) => n !== i) } : r));
}

function ReactionPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const pick = (emoji: string) => {
    setOpen(false);
    onPick(emoji);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Add a reaction"
          aria-label="Add a reaction"
          className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <SmilePlus className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-2 p-2">
        <div className="flex justify-between">
          {QUICK_REACTIONS.map((e) => (
            <button key={e} type="button" onClick={() => pick(e)} className="flex size-9 items-center justify-center rounded-md text-xl hover:bg-muted">
              {e}
            </button>
          ))}
        </div>
        <div className="max-h-56 space-y-2 overflow-y-auto border-t pt-2">
          {REACTION_GROUPS.map((g) => (
            <div key={g.label}>
              <p className="px-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
              <div className="grid grid-cols-6 gap-0.5">
                {g.emojis.map((e) => (
                  <button key={e} type="button" onClick={() => pick(e)} className="flex size-9 items-center justify-center rounded-md text-xl hover:bg-muted">
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Reaction chips for one message, the add-reaction button, and whatever else belongs on that line (Reply). */
function ReactionBar({
  m,
  me,
  onReact,
  end,
  children,
}: {
  m: ChatMessage;
  me: string;
  onReact: (messageId: string, emoji: string) => void;
  /** Right-align (my own bubbles on a phone). */
  end?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1", end && "justify-end")}>
      {m.reactions.map((r) => {
        const mine = r.userIds.includes(me);
        return (
          <button
            key={r.emoji}
            type="button"
            title={r.names.join(", ")}
            onClick={() => onReact(m.id, r.emoji)}
            className={cn(
              "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs leading-none hover:bg-muted",
              mine && "border-primary/50 bg-primary/10"
            )}
          >
            <span className="text-sm">{r.emoji}</span>
            <span className="tabular-nums">{r.userIds.length}</span>
          </button>
        );
      })}
      <ReactionPicker onPick={(e) => onReact(m.id, e)} />
      {children}
    </div>
  );
}

function MessageRow({ m, mine, compact, bubble }: { m: ChatMessage; mine: boolean; compact?: boolean; bubble?: boolean }) {
  if (bubble) {
    return (
      <div className={cn("flex items-end gap-2", mine && "flex-row-reverse")}>
        {!mine && (
          <Avatar className="size-7 shrink-0">
            <AvatarImage src={m.authorImage ?? undefined} alt="" />
            <AvatarFallback>{m.authorName[0] ?? "?"}</AvatarFallback>
          </Avatar>
        )}
        <div className={cn("flex min-w-0 max-w-[80%] flex-col", mine ? "items-end" : "items-start")}>
          {!mine && <p className="mb-0.5 px-1 text-[11px] text-muted-foreground">{m.authorName}</p>}
          {m.body && (
            <p
              className={cn(
                "rounded-2xl px-3.5 py-2 text-[15px] whitespace-pre-wrap break-words",
                mine ? "bg-primary text-primary-foreground" : "bg-muted"
              )}
            >
              {m.body}
            </p>
          )}
          <Attachments items={m.attachments} />
          <p className="mt-0.5 px-1 text-[10px] text-muted-foreground">{timeLabel(m.createdAt)}</p>
        </div>
      </div>
    );
  }
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
  heightClass = "h-[calc(100dvh-10rem)] min-h-[320px] lg:h-[560px]",
  showMembers = true,
  phoneTitle = "Team chat",
  backHref,
  fillViewport = false,
  dock = false,
  onBack,
}: {
  roomId: string;
  heightClass?: string;
  showMembers?: boolean;
  /** Shown in the full-screen header on a phone. */
  phoneTitle?: string;
  /** Where the phone's back arrow goes; inside the Loan Center it returns to that page's first section instead. */
  backHref?: string;
  /** Desktop: scroll the chat into place and size it to the rest of the screen, so the message box is always in view. */
  fillViewport?: boolean;
  /** Inside a floating window: fills the window, with no frame of its own. */
  dock?: boolean;
  /** Phone back arrow, when the chat is a floating window rather than a page. */
  onBack?: () => void;
}) {
  const router = useRouter();
  const loanCenter = useLoanCenterNav();
  const isPhone = useIsPhone();
  const box = useVisibleBox();
  const [state, setState] = useState<ChatRoomState | null>(null);
  const [openThread, setOpenThread] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
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
      scrollToEnd(bottomRef.current);
    }
  }, [state]);

  // On a phone the chat owns the screen: freeze the page behind it, and keep the newest message in view
  // when the keyboard opens or closes.
  useEffect(() => {
    if (!isPhone) return;
    const html = document.documentElement;
    const previous = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = previous;
    };
  }, [isPhone]);
  useEffect(() => {
    if (isPhone) scrollToEnd(bottomRef.current);
  }, [isPhone, box.height]);

  // Desktop fill: see useFillViewport. `loaded` matters: until the first fetch lands this is a placeholder with nothing to measure.
  const fitHeight = useFillViewport(rootRef, fillViewport && !isPhone, state !== null);

  function react(messageId: string, emoji: string) {
    if (!state) return;
    const me = state.readers.find((r) => r.userId === state.currentUserId)?.name.split(" ")[0] ?? "You";
    setState({
      ...state,
      messages: state.messages.map((m) =>
        m.id === messageId ? { ...m, reactions: withToggledReaction(m.reactions, emoji, state.currentUserId, me) } : m
      ),
    });
    toggleTeamReaction(roomId, messageId, emoji)
      .then(() => {
        broadcastChanged();
        return refresh();
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Couldn't add that reaction");
        void refresh();
      });
  }

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
    await sendTeamMessage(roomId, await stageLargeFiles(form, stageUploadChunk));
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

  if (!state && !isPhone) return <div className={cn("flex items-center justify-center text-sm text-muted-foreground", dock ? "h-full" : heightClass)}>Loading chat…</div>;

  const goBack = () => {
    if (onBack) onBack();
    else if (loanCenter) loanCenter.goToTab("client-needs");
    else if (backHref) router.push(backHref);
    else router.back();
  };

  const messageList = state ? (
    <>
      {topLevel.length === 0 && (
        <div className="flex h-full flex-col items-center justify-center gap-1 text-center text-sm text-muted-foreground">
          <MessageSquare className="size-6" />
          No messages yet. Say something to the team.
        </div>
      )}
      {topLevel.map((m) => {
        const thread = replies.get(m.id) ?? [];
        const isOpen = openThread === m.id;
        const mine = m.userId === state.currentUserId;
        return (
          <div key={m.id} className="space-y-2">
            <MessageRow m={m} mine={mine} bubble={isPhone} />
            <div className={cn(isPhone ? (mine ? "pr-1 text-right" : "pl-9") : "pl-10")}>
              <ReactionBar m={m} me={state.currentUserId} onReact={react} end={isPhone && mine}>
                <button
                  type="button"
                  className="px-1 text-xs text-primary hover:underline"
                  onClick={() => setOpenThread(isOpen ? null : m.id)}
                >
                  {thread.length > 0 ? `${thread.length} ${thread.length === 1 ? "reply" : "replies"}` : "Reply"}
                </button>
              </ReactionBar>
              {(isOpen || thread.length > 0) && (
                <div className={cn("mt-2 space-y-2 border-l-2 pl-3 text-left", isPhone && mine && "ml-auto max-w-[85%]")}>
                  {thread.map((r) => (
                    <div key={r.id} className="space-y-1">
                      <MessageRow m={r} mine={r.userId === state.currentUserId} compact bubble={isPhone} />
                      <div className={cn(isPhone ? (r.userId === state.currentUserId ? "pr-1" : "pl-9") : "pl-8")}>
                        <ReactionBar m={r} me={state.currentUserId} onReact={react} end={isPhone && r.userId === state.currentUserId} />
                      </div>
                    </div>
                  ))}
                  {isOpen && <Composer placeholder="Reply in thread…" autoFocus phone={isPhone} onSend={(msg) => send(msg, m.id)} onTyping={announceTyping} />}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {seenBy.length > 0 && <p className="text-right text-[11px] text-muted-foreground">Seen by {seenBy.join(", ")}</p>}
      <div ref={bottomRef} />
    </>
  ) : (
    <p className="py-10 text-center text-sm text-muted-foreground">Loading chat…</p>
  );

  const composerArea = (
    <>
      {typingNames.length > 0 && (
        <p className="mb-1.5 text-xs text-muted-foreground">
          {typingNames.join(", ")} {typingNames.length === 1 ? "is" : "are"} typing…
        </p>
      )}
      <Composer
        placeholder={isPhone ? "Message the team" : dock ? "Message" : "Message the team (internal only — clients never see this)"}
        phone={isPhone}
        onSend={(msg) => send(msg)}
        onTyping={announceTyping}
      />
    </>
  );

  // Phone: a full-screen conversation like Messenger. A header with a back arrow, messages that scroll
  // on their own, and the message box pinned to the bottom (riding above the keyboard when it's open).
  if (isPhone) {
    const keyboardOpen = typeof window !== "undefined" && box.height > 0 && box.height < window.innerHeight - 120;
    return (
      <div
        data-team-chat-phone
        className="fixed inset-x-0 z-[60] flex flex-col bg-background"
        style={box.height > 0 ? { top: box.top, height: box.height } : { top: 0, bottom: 0 }}
      >
        <div className="flex shrink-0 items-center gap-1 border-b px-2 py-2">
          {backHref && !loanCenter && !onBack ? (
            <Link href={backHref} aria-label="Back" className="flex size-10 items-center justify-center rounded-full hover:bg-muted">
              <ChevronLeft className="size-6" />
            </Link>
          ) : (
            <button type="button" aria-label="Back" onClick={goBack} className="flex size-10 items-center justify-center rounded-full hover:bg-muted">
              <ChevronLeft className="size-6" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-base leading-tight font-semibold">{phoneTitle}</p>
            <p className="text-[11px] text-muted-foreground">Internal only. Clients never see this.</p>
          </div>
          {showMembers && <RoomMembersDialog roomId={roomId} />}
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3">{messageList}</div>
        <div className={cn("shrink-0 border-t px-3 pt-2", keyboardOpen ? "pb-2" : "pb-[max(env(safe-area-inset-bottom),0.75rem)]")}>
          {composerArea}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={cn("flex flex-col", dock ? "h-full" : cn("rounded-md border", fillViewport && fitHeight ? "" : heightClass))}
      style={fillViewport && fitHeight ? { height: fitHeight } : undefined}
    >
      {showMembers && !dock && (
        <div className="flex justify-end border-b px-3 py-2">
          <RoomMembersDialog roomId={roomId} />
        </div>
      )}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">{messageList}</div>
      {/* The floating pencil button sits in the bottom-right corner, so full-page chats keep Send clear of it. */}
      <div className={cn("border-t p-3", !dock && "lg:pr-16")}>{composerArea}</div>
    </div>
  );
}
