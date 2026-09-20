"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Minus, X, Phone as PhoneIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendConversationMessage, getConversationForDock } from "@/server/actions/messages";
import { initiateConversationCall } from "@/server/actions/calls";
import type { DockWindow } from "@/components/messaging/chat-dock-context";

interface Message {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  createdAt: Date | string;
}

interface CallLog {
  id: string;
  direction: "inbound" | "outbound";
  status: string;
  startedAt: Date | string;
  durationSeconds: number | null;
}

type TimelineItem = { kind: "message"; at: Date; item: Message } | { kind: "call"; at: Date; item: CallLog };

function timeLabel(d: Date | string) {
  return new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function ChatWindowPanel({
  dockWindow,
  onClose,
  onMinimize,
}: {
  dockWindow: DockWindow;
  onClose: () => void;
  onMinimize: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [messages, setMessages] = useState<Message[]>([]);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [body, setBody] = useState(dockWindow.initialBody ?? "");
  const bottomRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    const conversation = await getConversationForDock(dockWindow.conversationId);
    setMessages(conversation.messages);
    setCallLogs(conversation.callLogs);
    setLoaded(true);
  }

  useEffect(() => {
    // Loading this window's history from the server when it opens (or when
    // a different conversation replaces it) is exactly the kind of "sync
    // with an external system" an effect is for — the actual setState calls
    // happen inside refresh()'s async body, after the fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dockWindow.conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, callLogs.length]);

  const timeline: TimelineItem[] = [
    ...messages.map((m): TimelineItem => ({ kind: "message", at: new Date(m.createdAt), item: m })),
    ...callLogs.map((c): TimelineItem => ({ kind: "call", at: new Date(c.startedAt), item: c })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    const formData = new FormData();
    formData.set("body", body);
    const toSend = body;
    setBody("");
    startTransition(async () => {
      try {
        await sendConversationMessage(dockWindow.conversationId, formData);
        await refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to send");
        setBody(toSend);
      }
    });
  }

  function handleCall() {
    startTransition(async () => {
      try {
        const result = await initiateConversationCall(dockWindow.conversationId);
        if (result.ok) {
          toast.success("Calling your phone now — you'll be connected once you pick up.");
        } else {
          toast.error(result.message ?? "Failed to start call");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to start call");
      }
    });
  }

  return (
    <div className="flex h-[420px] w-80 flex-col rounded-t-lg border border-b-0 bg-popover shadow-xl">
      <div className="flex items-center justify-between rounded-t-lg border-b bg-muted px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{dockWindow.borrowerName}</p>
          <p className="truncate text-xs text-muted-foreground">{dockWindow.borrowerPhone}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button type="button" variant="ghost" size="icon-sm" onClick={handleCall} title="Call" aria-label="Call">
            <PhoneIcon className="size-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onMinimize} title="Minimize" aria-label="Minimize">
            <Minus className="size-3.5" />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} title="Close" aria-label="Close">
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {!loaded && <p className="text-center text-xs text-muted-foreground">Loading…</p>}
        {loaded && timeline.length === 0 && (
          <p className="text-center text-xs text-muted-foreground">No messages or calls yet.</p>
        )}
        {timeline.map((t) =>
          t.kind === "message" ? (
            <div key={t.item.id} className={`flex ${t.item.direction === "outbound" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-sm whitespace-pre-wrap ${
                  t.item.direction === "outbound" ? "bg-foreground text-background" : "bg-muted"
                }`}
              >
                {t.item.body}
                <div className={`mt-0.5 text-[10px] ${t.item.direction === "outbound" ? "text-background/60" : "text-muted-foreground"}`}>
                  {timeLabel(t.item.createdAt)}
                </div>
              </div>
            </div>
          ) : (
            <div key={t.item.id} className="text-center text-[11px] text-muted-foreground">
              {t.item.direction === "outbound" ? "Outbound" : "Inbound"} call · {t.item.status}
              {t.item.durationSeconds ? ` · ${t.item.durationSeconds}s` : ""} · {timeLabel(t.item.startedAt)}
            </div>
          )
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="flex items-end gap-2 border-t p-2">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend(e);
            }
          }}
          rows={2}
          placeholder="Type a message…"
          className="min-h-0 resize-none text-sm"
        />
        <Button type="submit" size="sm" disabled={isPending || !body.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}
