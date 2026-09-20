"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChatDock } from "@/components/messaging/chat-dock-context";
import { ChatWindowPanel } from "@/components/messaging/chat-window-panel";
import { NewMessagePopover } from "@/components/messaging/new-message-popover";

/**
 * Messenger-style floating dock, mounted once in the (app) layout so it's
 * present on every page and survives client-side navigation — the whole
 * point is that opening a chat from a deal never navigates you away from
 * it. Open conversations render as panels immediately left of the compose
 * button; minimized ones collapse to a plain initials bubble (no borrower
 * photo exists, so the name has to stand in for one) stacked above it.
 */
export function ChatDockRoot() {
  const { windows, closeChat, minimizeChat, restoreChat } = useChatDock();
  const [composeOpen, setComposeOpen] = useState(false);

  const expanded = windows.filter((w) => !w.minimized);
  const minimized = windows.filter((w) => w.minimized);

  return (
    <div className="fixed right-4 bottom-0 z-40 flex items-end gap-3">
      {expanded.map((w) => (
        <ChatWindowPanel
          key={w.conversationId}
          dockWindow={w}
          onClose={() => closeChat(w.conversationId)}
          onMinimize={() => minimizeChat(w.conversationId)}
        />
      ))}

      <div className="flex flex-col items-end gap-2 pb-4">
        {minimized.map((w) => (
          <button
            key={w.conversationId}
            onClick={() => restoreChat(w.conversationId)}
            className="flex max-w-52 items-center gap-2 rounded-full border bg-popover py-1.5 pl-3 pr-1.5 shadow-lg hover:bg-muted"
          >
            <span className="min-w-0 text-left">
              <span className="block truncate text-xs font-semibold">{w.contactName}</span>
              <span className="block truncate text-[10px] text-muted-foreground">{w.contactType}</span>
            </span>
          </button>
        ))}
        <Button
          type="button"
          size="icon-lg"
          className="rounded-full shadow-lg"
          onClick={() => setComposeOpen((v) => !v)}
          aria-label="New message"
        >
          <Pencil className="size-5" />
        </Button>
      </div>

      {composeOpen && <NewMessagePopover onClose={() => setComposeOpen(false)} />}
    </div>
  );
}
