"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Phone as PhoneIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  sendConversationMessage,
  getConversationForDock,
  markConversationRead,
  getContactDealsContext,
  attachConversationToDeal,
  type ContactDealSummary,
} from "@/server/actions/messages";
import { initiateConversationCall, manualDialCall } from "@/server/actions/calls";
import { STAGES, labelFor } from "@/lib/labels";
import { cn } from "@/lib/utils";

interface ConversationSummary {
  id: string;
  dealId: string | null;
  primaryPhone: string;
  lastMessageAt: Date | string;
  displayName: string;
  hasUnread: boolean;
  messages: { body: string; direction: "inbound" | "outbound" }[];
  callLogs: { direction: "inbound" | "outbound"; status: string }[];
}

interface DealOption {
  id: string;
  loanNumber: number;
  borrowerName: string;
  propertyAddress: string;
}

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
  recordingUrl: string | null;
  reviewedAt: Date | string | null;
}

type TimelineItem = { kind: "message"; at: Date; item: Message } | { kind: "call"; at: Date; item: CallLog };

function timeLabel(d: Date | string) {
  return new Date(d).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function DealPill({ deal }: { deal: ContactDealSummary }) {
  return (
    <a
      href={`/deals/${deal.id}`}
      className="block rounded-md border px-2 py-1.5 text-xs hover:bg-muted"
    >
      <p className="font-medium">
        {deal.loanNumber ? `#${deal.loanNumber} — ` : ""}
        {deal.propertyAddress}
      </p>
      <p className="text-muted-foreground">{labelFor(STAGES, deal.stage)}</p>
    </a>
  );
}

export function CommunicationsView({
  conversations,
  allDeals,
}: {
  conversations: ConversationSummary[];
  allDeals: DealOption[];
}) {
  const [tab, setTab] = useState<"messages" | "dial">("messages");
  const [selectedId, setSelectedId] = useState<string | null>(conversations[0]?.id ?? null);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b pb-2">
        <h1 className="mr-4 text-xl font-semibold">Communications</h1>
        <button
          onClick={() => setTab("messages")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm",
            tab === "messages" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
          )}
        >
          Messages
        </button>
        <button
          onClick={() => setTab("dial")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm",
            tab === "dial" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"
          )}
        >
          Dial Out
        </button>
      </div>

      {tab === "dial" ? (
        <DialTab />
      ) : (
        <div className="flex min-h-0 flex-1 gap-4 pt-3">
          <div className="w-72 shrink-0 overflow-y-auto border-r pr-3">
            {conversations.length === 0 && <p className="p-3 text-sm text-muted-foreground">No activity yet.</p>}
            {conversations.map((c) => {
              const isUnread = c.hasUnread && !readIds.has(c.id);
              const lastMessage = c.messages[0];
              const lastCall = c.callLogs[0];
              const preview = lastMessage
                ? `${lastMessage.direction === "outbound" ? "You: " : ""}${lastMessage.body}`
                : lastCall
                  ? `${lastCall.direction === "inbound" ? "Incoming" : "Outgoing"} call — ${lastCall.status}`
                  : "No activity yet";
              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedId(c.id);
                    setReadIds((prev) => new Set(prev).add(c.id));
                    void markConversationRead(c.id);
                  }}
                  className={cn(
                    "block w-full rounded-md px-2 py-2 text-left",
                    c.id === selectedId ? "bg-muted" : "hover:bg-muted/50"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className={cn("truncate text-sm", isUnread ? "font-semibold" : "font-medium")}>{c.displayName}</p>
                    {isUnread && <span className="size-2 shrink-0 rounded-full bg-blue-500" />}
                  </div>
                  <p className={cn("truncate text-xs", isUnread ? "text-foreground" : "text-muted-foreground")}>{preview}</p>
                </button>
              );
            })}
          </div>

          {selected ? (
            <ThreadPane key={selected.id} conversation={selected} />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Select a conversation
            </div>
          )}

          {selected && <InfoPanel conversationId={selected.id} phone={selected.primaryPhone} dealId={selected.dealId} allDeals={allDeals} />}
        </div>
      )}
    </div>
  );
}

function ThreadPane({ conversation }: { conversation: ConversationSummary }) {
  const [isPending, startTransition] = useTransition();
  const [messages, setMessages] = useState<Message[]>([]);
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [body, setBody] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  async function refresh() {
    const full = await getConversationForDock(conversation.id);
    setMessages(full.messages);
    setCallLogs(full.callLogs);
    setLoaded(true);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    void markConversationRead(conversation.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

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
        await sendConversationMessage(conversation.id, formData);
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
        const result = await initiateConversationCall(conversation.id);
        if (result.ok) toast.success("Calling your phone now — you'll be connected once you pick up.");
        else toast.error(result.message ?? "Failed to start call");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to start call");
      }
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-md border">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <div>
          <p className="font-semibold">{conversation.displayName}</p>
          <p className="text-xs text-muted-foreground">{conversation.primaryPhone}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={handleCall} disabled={isPending}>
          <PhoneIcon className="size-4" />
          Call
        </Button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {!loaded && <p className="text-center text-xs text-muted-foreground">Loading…</p>}
        {loaded && timeline.length === 0 && <p className="text-center text-xs text-muted-foreground">No messages or calls yet.</p>}
        {timeline.map((t) =>
          t.kind === "message" ? (
            <div key={t.item.id} className={`flex ${t.item.direction === "outbound" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[70%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
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
            <div key={t.item.id} className="text-center text-xs text-muted-foreground">
              {t.item.direction === "outbound" ? "Outbound" : "Inbound"} call · {t.item.status}
              {t.item.durationSeconds ? ` · ${t.item.durationSeconds}s` : ""} · {timeLabel(t.item.startedAt)}
              {t.item.recordingUrl && (
                <>
                  {" · "}
                  <a href={t.item.recordingUrl} target="_blank" rel="noreferrer" className="underline">
                    Voicemail
                  </a>
                </>
              )}
            </div>
          )
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="flex items-end gap-2 border-t p-3">
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
          className="min-h-0 resize-none"
        />
        <Button type="submit" disabled={isPending || !body.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}

function InfoPanel({
  conversationId,
  phone,
  dealId,
  allDeals,
}: {
  conversationId: string;
  phone: string;
  dealId: string | null;
  allDeals: DealOption[];
}) {
  const [context, setContext] = useState<{
    active: ContactDealSummary[];
    closedRecent: ContactDealSummary[];
    lostRecent: ContactDealSummary[];
  } | null>(null);
  const [needsReview, setNeedsReview] = useState<CallLog[]>([]);
  const [showAttach, setShowAttach] = useState(false);

  useEffect(() => {
    async function load() {
      const [ctx, full] = await Promise.all([getContactDealsContext(phone), getConversationForDock(conversationId)]);
      setContext(ctx);
      setNeedsReview(full.callLogs.filter((c) => c.direction === "inbound" && !c.reviewedAt));
    }
    load();
  }, [conversationId, phone]);

  const hasAnyDeal = context && (context.active.length || context.closedRecent.length || context.lostRecent.length);

  return (
    <div className="w-72 shrink-0 space-y-4 overflow-y-auto border-l pl-3">
      {needsReview.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Needs Review</p>
          <div className="space-y-1">
            {needsReview.map((c) => (
              <div key={c.id} className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs dark:bg-amber-950">
                Missed call{c.recordingUrl ? " — voicemail" : ""} · {timeLabel(c.startedAt)}
                {c.recordingUrl && (
                  <>
                    {" · "}
                    <a href={c.recordingUrl} target="_blank" rel="noreferrer" className="underline">
                      Listen
                    </a>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deals</p>
        {!context && <p className="text-xs text-muted-foreground">Loading…</p>}
        {context && !hasAnyDeal && !dealId && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">No deal linked to this number yet.</p>
            {showAttach ? (
              <ActionForm action={attachConversationToDeal.bind(null, conversationId)} successMessage="Attached" className="space-y-2">
                <Select name="dealId" required>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a deal" />
                  </SelectTrigger>
                  <SelectContent>
                    {allDeals.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        #{d.loanNumber} — {d.borrowerName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <SubmitButton size="sm">Attach</SubmitButton>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setShowAttach(false)}>
                    Cancel
                  </Button>
                </div>
              </ActionForm>
            ) : (
              <div className="flex flex-col gap-1">
                <Button size="sm" variant="outline" onClick={() => setShowAttach(true)}>
                  Attach to existing deal
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={`/deals/new?phone=${encodeURIComponent(phone)}&conversationId=${conversationId}`}>Start new deal</a>
                </Button>
              </div>
            )}
          </div>
        )}
        {context && hasAnyDeal && (
          <div className="space-y-3">
            {context.active.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">Active</p>
                {context.active.map((d) => (
                  <DealPill key={d.id} deal={d} />
                ))}
              </div>
            )}
            {context.closedRecent.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">Closed (last 30 days)</p>
                {context.closedRecent.map((d) => (
                  <DealPill key={d.id} deal={d} />
                ))}
              </div>
            )}
            {context.lostRecent.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground">Lost (last 30 days)</p>
                {context.lostRecent.map((d) => (
                  <DealPill key={d.id} deal={d} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DialTab() {
  const [phone, setPhone] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleDial(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    const formData = new FormData();
    formData.set("phone", phone);
    startTransition(async () => {
      const result = await manualDialCall(formData);
      if (result.ok) toast.success("Calling your phone now — you'll be connected once you pick up.");
      else toast.error(result.message ?? "Failed to start call");
    });
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <form onSubmit={handleDial} className="w-full max-w-sm space-y-3 rounded-lg border p-6">
        <div>
          <p className="font-semibold">Dial a number</p>
          <p className="text-sm text-muted-foreground">
            For a number that isn&apos;t already a contact — rings your own phone first, then bridges to this number
            once you pick up, same as calling from a conversation.
          </p>
        </div>
        <Input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 555-5555"
          autoFocus
        />
        <Button type="submit" disabled={isPending || !phone.trim()} className="w-full">
          <PhoneIcon className="size-4" />
          Call
        </Button>
      </form>
    </div>
  );
}
