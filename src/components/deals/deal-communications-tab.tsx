"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatWindowPanel } from "@/components/messaging/chat-window-panel";
import { DealUpdateDialog } from "@/components/deals/deal-update-dialog";
import { useLoanCenterNav } from "@/components/deals/loan-center-nav-context";
import { getDealTextThreads, prepareContactConversation, type DealTextThread } from "@/server/actions/messages";
import { useFillViewport } from "@/lib/use-fill-viewport";
import { useIsPhone } from "@/lib/use-is-phone";
import { cn } from "@/lib/utils";

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

/**
 * Texts and calls with the outside people on this loan: the borrower first, then title, insurance and
 * anyone else already texted about it. Internal talk lives in Team Chat, a separate tab.
 */
export function DealCommunicationsTab({ dealId, propertyAddress }: { dealId: string; propertyAddress: string }) {
  const searchParams = useSearchParams();
  const nav = useLoanCenterNav();
  const isPhone = useIsPhone();
  const rootRef = useRef<HTMLDivElement>(null);
  const [threads, setThreads] = useState<DealTextThread[] | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  /** Threads started from here (no text or call yet): key → conversation id. */
  const [started, setStarted] = useState<Record<string, { conversationId: string; opener: string }>>({});
  const starting = useRef(new Set<string>());
  const [showThread, setShowThread] = useState(false);

  const wanted = nav?.focusThreadId ?? searchParams.get("c");
  const fitHeight = useFillViewport(rootRef, !isPhone, threads !== null);

  const load = useCallback(async () => {
    try {
      setThreads(await getDealTextThreads(dealId));
    } catch {
      // the next poll retries
    }
  }, [dealId]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const t = setInterval(load, 10_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  // Which thread is open: the one we were sent to, else the first with something unread, else the borrower.
  useEffect(() => {
    if (!threads) return;
    const target = wanted ? threads.find((t) => t.conversationId === wanted) : undefined;
    if (target) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedKey(target.key);
      setShowThread(true);
    } else if (!selectedKey || !threads.some((t) => t.key === selectedKey)) {
      setSelectedKey((threads.find((t) => t.unread > 0) ?? threads[0])?.key ?? null);
    }
  }, [threads, wanted, selectedKey]);

  const selected = threads?.find((t) => t.key === selectedKey) ?? null;
  const conversation = selected ? (selected.conversationId ? { conversationId: selected.conversationId, opener: "" } : started[selected.key]) : null;

  // First look at a person with no thread yet creates the (empty) thread, so there's a box to type in.
  useEffect(() => {
    if (!selected || selected.conversationId || started[selected.key] || starting.current.has(selected.key)) return;
    starting.current.add(selected.key);
    prepareContactConversation({ phone: selected.phone, dealId })
      .then((p) => setStarted((prev) => ({ ...prev, [selected.key]: { conversationId: p.conversationId, opener: p.initialBody } })))
      .catch((err) => {
        starting.current.delete(selected.key);
        toast.error(err instanceof Error ? err.message : "Couldn't open that conversation");
      });
  }, [selected, started, dealId]);

  if (threads === null) return <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>;

  if (threads.length === 0) {
    return (
      <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
        <MessageSquareText className="mx-auto mb-2 size-6" />
        No phone numbers on this loan yet. Add the borrower&apos;s (or title / insurance agent&apos;s) number and they&apos;ll show up here.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Texts and calls with the borrower and deal contacts. These go to their phones; the team talks in Team Chat.
        </p>
        {threads.length > 1 && <DealUpdateDialog dealId={dealId} people={threads.filter((t) => t.role !== "Other")} />}
      </div>
      <div
        ref={rootRef}
        style={fitHeight ? { height: fitHeight } : undefined}
        className={cn("grid gap-3 lg:grid-cols-[1fr_260px]", !fitHeight && "h-[calc(100dvh-14rem)] min-h-[420px]")}
      >
        <ul className={cn("min-h-0 space-y-1 overflow-y-auto lg:order-2", showThread && "max-lg:hidden")}>
          {threads.map((t) => (
            <li key={t.key}>
              <button
                type="button"
                onClick={() => {
                  setSelectedKey(t.key);
                  setShowThread(true);
                }}
                className={cn(
                  "w-full rounded-md border px-3 py-2 text-left hover:bg-muted/50",
                  t.key === selectedKey && "border-primary bg-primary/5",
                  t.unread > 0 && t.key !== selectedKey && "bg-primary/5"
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className={cn("truncate text-sm", t.unread > 0 ? "font-semibold" : "font-medium")}>{t.name}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {t.lastMessage && <span className="text-[10px] text-muted-foreground">{timeAgo(t.lastMessage.createdAt)}</span>}
                    {t.unread > 0 && (
                      <span className="rounded-full bg-primary px-1.5 text-[10px] leading-4 font-semibold text-primary-foreground">{t.unread}</span>
                    )}
                  </span>
                </span>
                <span className="block text-[11px] text-muted-foreground">{t.role}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {t.lastMessage ? `${t.lastMessage.direction === "outbound" ? "You: " : ""}${t.lastMessage.body}` : "No messages yet"}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className={cn("flex min-h-0 flex-col gap-2", !showThread && "max-lg:hidden")}>
          <Button type="button" variant="ghost" size="sm" className="self-start lg:hidden" onClick={() => setShowThread(false)}>
            <ChevronLeft className="size-4" />
            All conversations
          </Button>
          <div className="min-h-0 flex-1">
            {selected && conversation ? (
              <ChatWindowPanel
                key={conversation.conversationId}
                dockWindow={{
                  conversationId: conversation.conversationId,
                  contactName: selected.name,
                  contactPhone: selected.phone,
                  contactType: selected.role,
                  initialBody: conversation.opener,
                  dealAddress: propertyAddress,
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center rounded-md border text-sm text-muted-foreground">Opening…</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
