"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { markAllNotificationsRead, markNotificationRead } from "@/server/actions/notifications";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Item {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  createdAt: string;
  readAt: string | null;
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationsList({ items }: { items: Item[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const unread = items.filter((i) => !i.readAt).length;

  function open(item: Item) {
    startTransition(async () => {
      if (!item.readAt) await markNotificationRead(item.id);
      if (item.href) router.push(item.href);
      else router.refresh();
    });
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing yet. You&apos;ll see updates on your deals here.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{unread} unread</p>
        {unread > 0 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await markAllNotificationsRead();
                router.refresh();
              })
            }
          >
            Mark all read
          </Button>
        )}
      </div>
      <ul className="divide-y rounded-md border">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => open(item)}
              className={cn("flex w-full items-start gap-3 p-3 text-left hover:bg-muted/50", !item.readAt && "bg-primary/5")}
            >
              <span
                className={cn("mt-1.5 size-2 shrink-0 rounded-full", item.readAt ? "bg-transparent" : "bg-primary")}
                aria-label={item.readAt ? "Read" : "Unread"}
              />
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm", !item.readAt && "font-medium")}>{item.title}</span>
                {item.body && <span className="block text-xs text-muted-foreground">{item.body}</span>}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(item.createdAt)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
