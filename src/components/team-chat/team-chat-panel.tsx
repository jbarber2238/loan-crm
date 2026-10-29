"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUp, ChevronLeft, FileText, MessageSquare, Mic, Paperclip, Smile, SmilePlus, Square, X } from "lucide-react";
import {
  editTeamMessage,
  getRoomState,
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
import { findVideoEmbed, linkify } from "@/lib/linkify";
import { EMOJI_GROUPS, RECENT_EMOJI_KEY, insertAtSelection, withRecentEmoji } from "@/lib/chat-emoji";
import { gifInMessage } from "@/lib/chat-gif";
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

function readRecentEmoji(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(RECENT_EMOJI_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((e): e is string => typeof e === "string") : [];
  } catch {
    return [];
  }
}

/** The smiley next to the paperclip: pick an emoji and it lands in the message where the cursor is. */
function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  function pick(emoji: string) {
    const next = withRecentEmoji(recent, emoji);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_EMOJI_KEY, JSON.stringify(next));
    } catch {
      // Private windows can refuse storage; recents just aren't remembered.
    }
    onPick(emoji);
  }
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setRecent(readRecentEmoji());
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" size="icon-sm" variant="ghost" title="Add an emoji" aria-label="Add an emoji">
          <Smile className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {recent.length > 0 && (
            <div>
              <p className="px-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Recent</p>
              <div className="grid grid-cols-8 gap-0.5">
                {recent.map((e) => (
                  <button key={e} type="button" onClick={() => pick(e)} className="flex size-9 items-center justify-center rounded-md text-xl hover:bg-muted">
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}
          {EMOJI_GROUPS.map((g) => (
            <div key={g.label}>
              <p className="px-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
              <div className="grid grid-cols-8 gap-0.5">
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

interface GifResult {
  id: string;
  title: string;
  preview: string;
  send: string;
}

/** A GIF library from Giphy: trending to start, search as you type. Picking one sends it straight away. */
function GifPicker({ onPick }: { onPick: (url: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [gifs, setGifs] = useState<GifResult[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "not-set-up" | "error">("loading");

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    // Wait for a pause in typing so each letter doesn't become its own search.
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const res = await fetch(`/api/team-chat/gifs?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        const data = (await res.json()) as { configured: boolean; gifs: GifResult[]; error?: string };
        setGifs(data.gifs);
        setStatus(!data.configured ? "not-set-up" : data.error ? "error" : "ready");
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) setStatus("error");
      }
    }, query ? 300 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="icon-sm" variant="ghost" title="Send a GIF" aria-label="Send a GIF" className="text-[10px] font-bold tracking-tight">
          GIF
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2 p-2">
        {status === "not-set-up" ? (
          <p className="p-2 text-sm text-muted-foreground">GIFs aren&apos;t turned on yet. An admin needs to add a free Giphy key to the CRM.</p>
        ) : (
          <>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search GIFs"
              aria-label="Search GIFs"
              className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
            />
            <div className="max-h-64 overflow-y-auto">
              {status === "loading" && gifs.length === 0 && <p className="p-2 text-sm text-muted-foreground">Loading…</p>}
              {status === "error" && <p className="p-2 text-sm text-muted-foreground">Couldn&apos;t load GIFs right now. Try again in a minute.</p>}
              {status === "ready" && gifs.length === 0 && <p className="p-2 text-sm text-muted-foreground">No GIFs found for that.</p>}
              <div className="grid grid-cols-2 gap-1">
                {gifs.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    title={g.title}
                    onClick={() => {
                      setOpen(false);
                      onPick(g.send);
                    }}
                    className="overflow-hidden rounded-md bg-muted hover:ring-2 hover:ring-ring"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={g.preview} alt={g.title} loading="lazy" className="h-24 w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
            <p className="text-center text-[10px] text-muted-foreground">Powered by GIPHY</p>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
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
  const textBox = useRef<HTMLTextAreaElement>(null);
  const voice = useVoiceRecorder();

  const canSend = Boolean(text.trim() || files.length || clip);

  function submit() {
    if (!canSend || voice.recording) return;
    // A plain text message shows in the chat straight away (the panel adds it before the server answers),
    // so clear the box now and put the words back only if the send fails. Files and voice clips still wait.
    if (files.length === 0 && !clip) {
      const sent = text.trim();
      setText("");
      onSend({ text: sent, files: [], clip: null }).catch((err) => {
        setText((current) => current || sent);
        toast.error(err instanceof Error ? err.message : "Couldn't send that");
      });
      return;
    }
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

  function insertEmoji(emoji: string) {
    const box = textBox.current;
    const at = insertAtSelection(text, box?.selectionStart ?? text.length, box?.selectionEnd ?? text.length, emoji);
    setText(at.text);
    onTyping?.();
    // Put the cursor right after the emoji once React has rewritten the box.
    requestAnimationFrame(() => {
      box?.focus();
      box?.setSelectionRange(at.cursor, at.cursor);
    });
  }

  function sendGif(url: string) {
    onSend({ text: url, files: [], clip: null }).catch((err) => toast.error(err instanceof Error ? err.message : "Couldn't send that GIF"));
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
            <PendingFile key={`${f.name}-${i}`} file={f} onRemove={() => setFiles(files.filter((_, n) => n !== i))} />
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
        <EmojiPicker onPick={insertEmoji} />
        <GifPicker onPick={sendGif} />
        <Textarea
          ref={textBox}
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
          // The box grows with what's typed, up to a cap; past that the text scrolls inside it, so Send never leaves the screen.
          className={cn("max-h-40 min-h-9 resize-none overflow-y-auto", phone && "max-h-32 min-h-10 rounded-3xl px-4 py-2")}
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

/** A file waiting to be sent: a picture shows as a thumbnail you can check before it goes, anything else by name. */
function PendingFile({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isImage = file.type.startsWith("image/");
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!isImage) return;
    let cancelled = false;
    const reader = new FileReader();
    reader.onload = () => {
      if (!cancelled && typeof reader.result === "string") setUrl(reader.result);
    };
    reader.readAsDataURL(file);
    return () => {
      cancelled = true;
    };
  }, [file, isImage]);
  return (
    <span className="flex max-w-full items-center gap-2 rounded-md border bg-muted/40 p-1.5 text-xs">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-14 rounded object-cover" />
      ) : (
        <Paperclip className="size-3 shrink-0" />
      )}
      <span className="max-w-40 truncate">{file.name}</span>
      <button type="button" aria-label={`Remove ${file.name}`} onClick={onRemove}>
        <X className="size-3" />
      </button>
    </span>
  );
}

/** A Loom, YouTube or Vimeo link in a message plays right under it, so nobody has to leave the chat to watch. */
function VideoPreview({ text }: { text: string }) {
  const video = text ? findVideoEmbed(text) : null;
  if (!video) return null;
  return (
    <div className="mt-1.5 w-full max-w-sm">
      <div className="aspect-video overflow-hidden rounded-lg border bg-black">
        <iframe
          src={video.src}
          title={`${video.provider} video`}
          loading="lazy"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
          className="size-full border-0"
        />
      </div>
    </div>
  );
}

/** A message that is just a GIF address shows the picture, not the web address. */
function GifPreview({ text }: { text: string }) {
  const url = gifInMessage(text);
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="mt-1 block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="GIF" loading="lazy" className="max-h-52 max-w-[16rem] rounded-lg border object-contain" />
    </a>
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
  onEdit,
  children,
}: {
  m: ChatMessage;
  me: string;
  onReact: (messageId: string, emoji: string) => void;
  /** Right-align (my own bubbles on a phone). */
  end?: boolean;
  /** Given for my own messages with text: shows an Edit button. */
  onEdit?: () => void;
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
      {onEdit && (
        <button type="button" className="px-1 text-xs text-muted-foreground hover:text-foreground hover:underline" onClick={onEdit}>
          Edit
        </button>
      )}
    </div>
  );
}

/** Replaces a message's text while its author is changing it: Enter saves, Escape cancels. */
function InlineEditor({ initial, onSave, onCancel }: { initial: string; onSave: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial);
  const save = () => {
    if (text.trim()) onSave(text);
  };
  return (
    <div className="mt-1 w-full space-y-1.5">
      <Textarea
        value={text}
        autoFocus
        rows={2}
        aria-label="Edit message"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            save();
          } else if (e.key === "Escape") {
            onCancel();
          }
        }}
        className="min-h-16 resize-none text-sm"
      />
      <div className="flex items-center gap-2 text-xs">
        <Button type="button" size="xs" disabled={!text.trim()} onClick={save}>
          Save
        </Button>
        <Button type="button" size="xs" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <span className="text-muted-foreground">Enter to save, Esc to cancel</span>
      </div>
    </div>
  );
}

function MessageRow({
  m,
  mine,
  compact,
  bubble,
  editing,
  onSaveEdit,
  onCancelEdit,
}: {
  m: ChatMessage;
  mine: boolean;
  compact?: boolean;
  bubble?: boolean;
  editing?: boolean;
  onSaveEdit?: (text: string) => void;
  onCancelEdit?: () => void;
}) {
  const edited = m.editedAt ? " · edited" : "";
  const editor = editing && onSaveEdit && onCancelEdit ? <InlineEditor initial={m.body} onSave={onSaveEdit} onCancel={onCancelEdit} /> : null;
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
          {editor ??
            (m.body && !gifInMessage(m.body) && (
            <p
              className={cn(
                "rounded-2xl px-3.5 py-2 text-[15px] whitespace-pre-wrap break-words",
                mine ? "bg-primary text-primary-foreground" : "bg-muted"
              )}
            >
              {linkify(m.body)}
            </p>
          ))}
          <VideoPreview text={m.body} />
          <GifPreview text={m.body} />
          <Attachments items={m.attachments} />
          <p className="mt-0.5 px-1 text-[10px] text-muted-foreground">
            {timeLabel(m.createdAt)}
            {edited}
          </p>
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
          {edited}
        </p>
        {editor ?? (m.body && !gifInMessage(m.body) && <p className="text-sm whitespace-pre-wrap break-words">{linkify(m.body)}</p>)}
        <VideoPreview text={m.body} />
        <GifPreview text={m.body} />
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
  /** Messages I just sent that the server hasn't confirmed yet; shown right away so sending feels instant. */
  const [pending, setPending] = useState<ChatMessage[]>([]);
  const [openThread, setOpenThread] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
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
      const visible = !document.hidden;
      // One trip: the server marks the room read in the same call when someone is actually looking at it.
      const next = await getRoomState(roomId, visible);
      setState(next);
      if (visible) {
        const unreadFromOthers = next.messages.some(
          (m) => m.userId !== next.currentUserId && new Date(m.createdAt) > lastReadSent.current
        );
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

  const messages = useMemo(() => {
    const confirmed = state?.messages ?? [];
    // Once the real copy has arrived (a poll can land before the send finishes), don't show the placeholder as well.
    const waiting = pending.filter(
      (p) => !confirmed.some((m) => m.userId === p.userId && m.body === p.body && new Date(m.createdAt).getTime() >= new Date(p.createdAt).getTime() - 5000)
    );
    return [...confirmed, ...waiting];
  }, [state, pending]);

  const { topLevel, replies } = useMemo(() => {
    const top: ChatMessage[] = [];
    const rep = new Map<string, ChatMessage[]>();
    for (const m of messages) {
      if (m.parentId) rep.set(m.parentId, [...(rep.get(m.parentId) ?? []), m]);
      else top.push(m);
    }
    return { topLevel: top, replies: rep };
  }, [messages]);

  // Scroll to the newest message when new ones arrive.
  useEffect(() => {
    const n = messages.length;
    if (n !== lastCount.current) {
      lastCount.current = n;
      scrollToEnd(bottomRef.current);
    }
  }, [messages]);

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

  function saveEdit(m: ChatMessage, text: string) {
    const next = text.trim();
    setEditingId(null);
    if (!state || !next || next === m.body) return;
    // Show the new text straight away; the refresh after the server answers replaces it with the saved copy.
    setState({
      ...state,
      messages: state.messages.map((x) => (x.id === m.id ? { ...x, body: next, editedAt: new Date().toISOString() } : x)),
    });
    editTeamMessage(roomId, m.id, next)
      .then(() => {
        broadcastChanged();
        return refresh();
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Couldn't save that edit");
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
    const tempId = `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    if (state && message.files.length === 0 && !message.clip) {
      const mine = state.messages.find((m) => m.userId === state.currentUserId);
      const name = mine?.authorName ?? state.readers.find((r) => r.userId === state.currentUserId)?.name ?? "You";
      setPending((prev) => [
        ...prev,
        {
          id: tempId,
          userId: state.currentUserId,
          authorName: name,
          authorImage: mine?.authorImage ?? null,
          body: message.text,
          parentId,
          createdAt: new Date().toISOString(),
          editedAt: null,
          attachments: [],
          reactions: [],
        },
      ]);
    }
    try {
      await sendTeamMessage(roomId, await stageLargeFiles(form, stageUploadChunk));
      broadcastChanged();
      await refresh();
    } finally {
      setPending((prev) => prev.filter((m) => m.id !== tempId));
    }
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
            <MessageRow
              m={m}
              mine={mine}
              bubble={isPhone}
              editing={editingId === m.id}
              onSaveEdit={(text) => saveEdit(m, text)}
              onCancelEdit={() => setEditingId(null)}
            />
            <div className={cn(isPhone ? (mine ? "pr-1 text-right" : "pl-9") : "pl-10")}>
              <ReactionBar
                m={m}
                me={state.currentUserId}
                onReact={react}
                end={isPhone && mine}
                onEdit={mine && m.body && !m.id.startsWith("pending-") ? () => setEditingId(m.id) : undefined}
              >
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
                      <MessageRow
                        m={r}
                        mine={r.userId === state.currentUserId}
                        compact
                        bubble={isPhone}
                        editing={editingId === r.id}
                        onSaveEdit={(text) => saveEdit(r, text)}
                        onCancelEdit={() => setEditingId(null)}
                      />
                      <div className={cn(isPhone ? (r.userId === state.currentUserId ? "pr-1" : "pl-9") : "pl-8")}>
                        <ReactionBar
                          m={r}
                          me={state.currentUserId}
                          onReact={react}
                          end={isPhone && r.userId === state.currentUserId}
                          onEdit={r.userId === state.currentUserId && r.body && !r.id.startsWith("pending-") ? () => setEditingId(r.id) : undefined}
                        />
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
