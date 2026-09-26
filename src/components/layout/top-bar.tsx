"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Bell, MessageCircle } from "lucide-react";
import {
  getUnreadNotificationCount,
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/server/actions/notifications";
import { getChatRooms, type ChatRoomSummary } from "@/server/actions/team-chat";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

  const loadCount = useCallback(() => getUnreadNotificationCount().then(setCount).catch(() => {}), []);
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
      <PopoverContent align="end" className="w-96 p-0">
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

function roomHref(r: ChatRoomSummary): string {
  return r.kind === "deal" && r.dealId ? `/deals/${r.dealId}/loan-center?tab=team-chat` : `/team-chat?room=${r.roomId}`;
}

function TeamChatMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [rooms, setRooms] = useState<ChatRoomSummary[]>([]);

  const load = useCallback(
    () =>
      getChatRooms(true)
        .then((r) => {
          setUnread(r.totalUnread);
          setRooms(r.rooms);
        })
        .catch(() => {}),
    []
  );
  useEffect(() => {
    load();
    const t = setInterval(load, 10_000);
    return () => clearInterval(t);
  }, [load, pathname]);

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) load(); }}>
      <IconButton label="Team chat" count={unread}>
        <MessageCircle className="size-5" />
      </IconButton>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Team Chat</p>
          <p className="text-xs text-muted-foreground">Internal only</p>
        </div>
        <ul className="max-h-96 divide-y overflow-y-auto">
          {rooms.length === 0 && <li className="p-4 text-sm text-muted-foreground">No team messages yet.</li>}
          {rooms.map((r) => (
            <li key={r.roomId}>
              <Link
                href={roomHref(r)}
                onClick={() => setOpen(false)}
                className={cn("flex items-start gap-2.5 px-4 py-3 hover:bg-muted/50", r.unread > 0 && "bg-primary/5")}
              >
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm", r.unread > 0 && "font-semibold")}>{r.title}</span>
                  {r.lastMessage && (
                    <span className="block truncate text-xs text-muted-foreground">
                      {r.unread > 0 ? "New message · " : ""}
                      {r.lastMessage.authorName.split(" ")[0]}: {r.lastMessage.body}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
                  {r.lastMessage && timeAgo(r.lastMessage.createdAt)}
                  {r.unread > 0 && <span className="size-2 rounded-full bg-primary" />}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <Link
          href="/team-chat"
          onClick={() => setOpen(false)}
          className="block border-t px-4 py-2.5 text-center text-sm text-primary hover:bg-muted/50"
        >
          Open Team Chat
        </Link>
      </PopoverContent>
    </Popover>
  );
}

/** Top-right bar: team chat (internal) and notifications — kept apart from client texting in Communications. */
export function TopBar() {
  return (
    <div className="sticky top-0 z-10 flex h-14 items-center justify-end gap-2 border-b bg-background/90 px-4 backdrop-blur md:px-6">
      <TeamChatMenu />
      <NotificationsMenu />
    </div>
  );
}
