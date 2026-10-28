"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Bell, MessageSquareText } from "lucide-react";
import {
  getMySoundPrefs,
  getUnreadNotificationSummary,
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/server/actions/notifications";
import { getTextsMenu, type TextsMenuItem } from "@/server/actions/messages";
import { useOpenTextThread } from "@/components/messaging/chat-dock-context";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MobileNavButton } from "@/components/layout/mobile-nav";
import { playSound } from "@/lib/notification-sound";
import { cn } from "@/lib/utils";

function CountBubble({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="absolute -top-1 -right-1 flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold leading-5 text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}

function IconButton({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <PopoverTrigger asChild>
      <button
        type="button"
        aria-label={count > 0 ? `${label} (${count} unread)` : label}
        className="relative flex size-10 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-muted/70"
      >
        {children}
        <CountBubble n={count} />
      </button>
    </PopoverTrigger>
  );
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

type Notif = Awaited<ReturnType<typeof listMyNotifications>>[number];

function NotificationsMenu() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<Notif[]>([]);
  const [, startTransition] = useTransition();

  const prevCount = useRef<{ total: number; texts: number } | null>(null);
  const loadCount = useCallback(
    () =>
      Promise.all([getUnreadNotificationSummary(), getMySoundPrefs()])
        .then(([summary, prefs]) => {
          // Sound only when something NEW arrives after the first load; a
          // client text gets its own sound, everything else the chime.
          const prev = prevCount.current;
          if (prev) {
            if (summary.texts > prev.texts) {
              if (prefs.soundTexts) playSound("text");
            } else if (summary.total > prev.total && prefs.soundNotifications) {
              playSound("notification");
            }
          }
          prevCount.current = summary;
          setCount(summary.total);
        })
        .catch(() => {}),
    []
  );
  useEffect(() => {
    loadCount();
    const t = setInterval(loadCount, 30_000);
    return () => clearInterval(t);
  }, [loadCount, pathname]);

  useEffect(() => {
    if (open) listMyNotifications(12).then(setItems).catch(() => {});
  }, [open]);

  function openItem(n: Notif) {
    setOpen(false);
    startTransition(async () => {
      if (!n.readAt) await markNotificationRead(n.id);
      loadCount();
      if (n.href) router.push(n.href);
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <IconButton label="Notifications" count={count}>
        <Bell className="size-5" />
      </IconButton>
      <PopoverContent align="end" className="w-[calc(100vw-1.5rem)] p-0 sm:w-96">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          {count > 0 && (
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() =>
                startTransition(async () => {
                  await markAllNotificationsRead();
                  setItems((prev) => prev.map((i) => ({ ...i, readAt: i.readAt ?? new Date() })));
                  loadCount();
                })
              }
            >
              Mark all read
            </button>
          )}
        </div>
        <ul className="max-h-96 divide-y overflow-y-auto">
          {items.length === 0 && <li className="p-4 text-sm text-muted-foreground">Nothing yet.</li>}
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => openItem(n)}
                className={cn("flex w-full items-start gap-2.5 px-4 py-3 text-left hover:bg-muted/50", !n.readAt && "bg-primary/5")}
              >
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm", !n.readAt && "font-medium")}>{n.title}</span>
                  {n.body && <span className="block truncate text-xs text-muted-foreground">{n.body}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(n.createdAt.toString())}</span>
              </button>
            </li>
          ))}
        </ul>
        <Link
          href="/notifications"
          onClick={() => setOpen(false)}
          className="block border-t px-4 py-2.5 text-center text-sm text-primary hover:bg-muted/50"
        >
          See all notifications
        </Link>
      </PopoverContent>
    </Popover>
  );
}

function TextsMenu() {
  const pathname = usePathname();
  const openThread = useOpenTextThread();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<TextsMenuItem[]>([]);

  const prevUnread = useRef<number | null>(null);
  const load = useCallback(
    () =>
      Promise.all([getTextsMenu(), getMySoundPrefs()])
        .then(([r, prefs]) => {
          if (prevUnread.current !== null && r.totalUnread > prevUnread.current && prefs.soundTexts) playSound("text");
          prevUnread.current = r.totalUnread;
          setUnread(r.totalUnread);
          setItems(r.items);
        })
        .catch(() => {}),
    []
  );
  // Client texts arrive by webhook, not Realtime, so this one polls.
  useEffect(() => {
    void load();
    const t = setInterval(load, 8_000);
    return () => clearInterval(t);
  }, [load, pathname]);

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) load(); }}>
      <IconButton label="Texts" count={unread}>
        <MessageSquareText className="size-5" />
      </IconButton>
      <PopoverContent align="end" className="w-[calc(100vw-1.5rem)] p-0 sm:w-96">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Texts</p>
          <p className="text-xs text-muted-foreground">Borrowers and deal contacts</p>
        </div>
        <ul className="max-h-96 divide-y overflow-y-auto">
          {items.length === 0 && <li className="p-4 text-sm text-muted-foreground">No texts yet.</li>}
          {items.map((i) => (
            <li key={i.conversationId}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  openThread(i.conversationId, i.dealId);
                }}
                className={cn("flex w-full items-start gap-2.5 px-4 py-3 text-left hover:bg-muted/50", i.unread > 0 && "bg-primary/5")}
              >
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm", i.unread > 0 && "font-semibold")}>{i.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{i.subtitle}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {i.direction === "outbound" ? "You: " : ""}
                    {i.preview}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[11px] text-muted-foreground">{timeAgo(i.at)}</span>
                  {i.unread > 0 && (
                    <span className="rounded-full bg-primary px-1.5 text-[10px] leading-4 font-semibold text-primary-foreground">{i.unread}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <Link
          href="/inbox"
          onClick={() => setOpen(false)}
          className="block border-t px-4 py-2.5 text-center text-sm text-primary hover:bg-muted/50"
        >
          Open Communications
        </Link>
      </PopoverContent>
    </Popover>
  );
}

/** Top-right bar: outside texts (borrowers, deal contacts) and notifications. Internal team chat lives in the floating pencil. */
export function TopBar() {
  return (
    <div className="sticky top-0 z-10 flex h-14 items-center justify-between gap-2 border-b bg-background/90 px-3 backdrop-blur sm:px-4 md:px-6">
      <MobileNavButton />
      <div className="ml-auto flex items-center gap-2">
        <TextsMenu />
        <NotificationsMenu />
      </div>
    </div>
  );
}
