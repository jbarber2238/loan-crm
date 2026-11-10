"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChatRoomSummary } from "@/server/actions/team-chat";

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

/**
 * Opens by itself when you log in, or come back after being away, and there are team messages you haven't read.
 * Lists just the chats with something waiting (direct messages first); click one to open it.
 */
export function TeamUnreadPanel({
  rooms,
  onOpen,
  onClose,
}: {
  rooms: ChatRoomSummary[];
  onOpen: (room: ChatRoomSummary) => void;
  onClose: () => void;
}) {
  const waiting = rooms.filter((r) => r.unread > 0).sort((a, b) => Number(b.kind === "dm") - Number(a.kind === "dm"));
  const total = waiting.reduce((sum, r) => sum + r.unread, 0);
  if (waiting.length === 0) return null;

  return (
    <div
      role="dialog"
      aria-label="Unread team messages"
      className="animate-chat-toast-in fixed inset-x-0 bottom-0 z-50 flex max-h-[75dvh] flex-col rounded-t-xl border border-[#fa5f05]/60 bg-popover shadow-2xl sm:static sm:max-h-[min(460px,70vh)] sm:w-80 sm:rounded-t-lg sm:border-b-0"
    >
      <div className="flex items-start justify-between gap-2 rounded-t-xl border-b bg-[#fa5f05] px-3 py-2.5 text-[#0b0c0d] sm:rounded-t-lg">
        <div>
          <p className="text-base font-bold sm:text-sm">
            {total === 1 ? "1 unread team message" : `${total} unread team messages`}
          </p>
          <p className="text-[11px] opacity-80">
            in {waiting.length === 1 ? "1 chat" : `${waiting.length} chats`}. Tap one to read it.
          </p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close" className="text-[#0b0c0d] hover:bg-black/10">
          <X className="size-4" />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {waiting.map((r) => (
          <button
            key={r.roomId}
            type="button"
            onClick={() => onOpen(r)}
            className="flex w-full items-start gap-2 rounded-md px-2 py-2.5 text-left hover:bg-muted sm:py-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{r.title}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {r.lastMessage ? `${r.lastMessage.authorName.split(" ")[0]}: ${r.lastMessage.body}` : ""}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-0.5">
              {r.lastMessage && <span className="text-[10px] text-muted-foreground">{timeAgo(r.lastMessage.createdAt)}</span>}
              <span className="rounded-full bg-[#fa5f05] px-1.5 text-[10px] leading-4 font-bold text-[#0b0c0d]">{r.unread}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between border-t px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <Link href="/team-chat" onClick={onClose} className="text-xs font-medium text-primary hover:underline">
          Open Team Chat
        </Link>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Later
        </Button>
      </div>
    </div>
  );
}
