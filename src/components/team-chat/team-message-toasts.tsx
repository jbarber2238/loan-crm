"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

export interface TeamToast {
  /** One per chat: a newer message in the same chat updates this one instead of stacking another. */
  roomId: string;
  heading: string;
  body: string;
  /** How many messages in this chat are waiting. */
  count: number;
  /** Direct messages and @tags stay until opened or dismissed; the rest fade after a few seconds. */
  sticky: boolean;
  /** Bumped by every new message, which restarts the fade timer. */
  stamp: number;
}

const FADE_MS = 8000;

function ToastCard({
  toast,
  visible,
  onOpen,
  onDismiss,
}: {
  toast: TeamToast;
  /** The tab is on screen. The fade timer only runs then, so a message that lands in a background tab is still there when you come back. */
  visible: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (toast.sticky || !visible) return;
    const t = setTimeout(onDismiss, FADE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onDismiss is a fresh closure each render; stamp restarts the timer
  }, [toast.sticky, toast.stamp, visible]);

  return (
    <div
      role="status"
      className="animate-chat-toast-in relative w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border border-[#fa5f05]/60 bg-popover shadow-xl"
    >
      <button type="button" onClick={onOpen} className="block w-full rounded-xl py-2.5 pr-9 pl-3.5 text-left hover:bg-muted/60">
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{toast.heading}</span>
          {toast.count > 1 && (
            <span className="shrink-0 rounded-full bg-[#fa5f05] px-1.5 text-[10px] leading-4 font-bold text-[#0b0c0d]">{toast.count} new</span>
          )}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{toast.body || "Sent an attachment"}</span>
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute top-1.5 right-1.5 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/** New-message previews that rise above the chat button. Click one to open that chat. */
export function TeamMessageToasts({
  toasts,
  visible,
  onOpen,
  onDismiss,
}: {
  toasts: TeamToast[];
  visible: boolean;
  onOpen: (roomId: string) => void;
  onDismiss: (roomId: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="flex flex-col items-end gap-2" aria-live="polite">
      {toasts.map((t) => (
        <ToastCard key={t.roomId} toast={t} visible={visible} onOpen={() => onOpen(t.roomId)} onDismiss={() => onDismiss(t.roomId)} />
      ))}
    </div>
  );
}
