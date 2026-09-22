"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Minus, X, Phone as PhoneIcon, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  sendConversationMessage,
  getConversationForDock,
  markConversationRead,
  searchContacts,
  addConversationParticipant,
  removeConversationParticipant,
  type ContactSearchResult,
} from "@/server/actions/messages";
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

interface Participant {
  id: string;
  name: string | null;
  phone: string;
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
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [addingParticipant, setAddingParticipant] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [body, setBody] = useState(dockWindow.initialBody ?? "");
  const bottomRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    const conversation = await getConversationForDock(dockWindow.conversationId);
    setMessages(conversation.messages);
    setCallLogs(conversation.callLogs);
    setParticipants(conversation.participants);
    setLoaded(true);
  }

  function handleRemoveParticipant(participantId: string) {
    startTransition(async () => {
      try {
        await removeConversationParticipant(participantId);
        await refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't remove participant");
      }
    });
  }

  useEffect(() => {
    // Loading this window's history from the server when it opens (or when
    // a different conversation replaces it) is exactly the kind of "sync
    // with an external system" an effect is for — the actual setState calls
    // happen inside refresh()'s async body, after the fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    void markConversationRead(dockWindow.conversationId);
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
          <p className="truncate text-sm font-semibold">{dockWindow.contactName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {dockWindow.contactType} · {dockWindow.contactPhone}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setAddingParticipant((v) => !v)}
            title="Add someone to this conversation"
            aria-label="Add someone to this conversation"
          >
            <UserPlus className="size-3.5" />
          </Button>
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

      {participants.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b bg-muted/40 px-3 py-1.5">
          {participants.map((p) => (
            <span
              key={p.id}
              className="flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[10px]"
            >
              {p.name || p.phone}
              <button
                type="button"
                onClick={() => handleRemoveParticipant(p.id)}
                aria-label={`Remove ${p.name || p.phone}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {addingParticipant && (
        <AddParticipantForm
          conversationId={dockWindow.conversationId}
          onAdded={async () => {
            setAddingParticipant(false);
            await refresh();
          }}
        />
      )}

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

// Adds someone else to this one thread — a co-signer, a spouse, an
// assistant a borrower wants looped into every message. Ad hoc per
// conversation rather than a permanent field on the deal, so it works the
// same regardless of who's involved. Search hits the same contact directory
// "New message" uses; typing name+phone directly covers anyone not in it
// yet (a borrower's assistant, say).
function AddParticipantForm({ conversationId, onAdded }: { conversationId: string; onAdded: () => void | Promise<void> }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContactSearchResult[]>([]);
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    const handle = setTimeout(() => {
      startTransition(async () => setResults(await searchContacts(trimmed)));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  function add(name: string | null, phone: string) {
    const formData = new FormData();
    if (name) formData.set("name", name);
    formData.set("phone", phone);
    startTransition(async () => {
      try {
        await addConversationParticipant(conversationId, formData);
        setQuery("");
        setResults([]);
        setManualName("");
        setManualPhone("");
        await onAdded();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't add participant");
      }
    });
  }

  return (
    <div className="space-y-1.5 border-b bg-muted/30 p-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search contacts…"
        className="h-7 text-xs"
      />
      {query.trim().length >= 2 && results.length > 0 && (
        <div className="max-h-24 overflow-y-auto rounded-md border bg-popover">
          {results.map((r) => (
            <button
              key={r.key}
              type="button"
              disabled={pending}
              onClick={() => add(r.name, r.phone)}
              className="block w-full px-2 py-1 text-left text-xs hover:bg-muted"
            >
              {r.name} <span className="text-muted-foreground">· {r.contactType}</span>
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1">
        <Input
          value={manualName}
          onChange={(e) => setManualName(e.target.value)}
          placeholder="Name (optional)"
          className="h-7 text-xs"
        />
        <Input
          value={manualPhone}
          onChange={(e) => setManualPhone(e.target.value)}
          placeholder="Phone"
          className="h-7 text-xs"
        />
        <Button
          type="button"
          size="sm"
          className="h-7 shrink-0 px-2 text-xs"
          disabled={!manualPhone.trim() || pending}
          onClick={() => add(manualName.trim() || null, manualPhone.trim())}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
