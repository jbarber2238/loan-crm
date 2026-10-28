"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ContactType } from "@/server/actions/messages";

export type { ContactType };

/** Who an outside text thread is with, as the thread view needs it. */
export interface DockWindow {
  conversationId: string;
  contactName: string;
  contactPhone: string;
  contactType: ContactType;
  initialBody?: string;
}

type OpenChatInput = DockWindow & {
  /** The deal this is about; its Communications tab is where the thread opens. Without one, the Communications page. */
  dealId?: string | null;
};

/** Fired when "text this person" is clicked while already inside that deal's Loan Center, so it can switch tabs without a reload. */
export const OPEN_TEXT_THREAD_EVENT = "loan-center:open-text-thread";
export interface OpenTextThreadDetail {
  conversationId: string;
}

/** Takes you to a text thread: its deal's Communications tab, or the Communications page when it isn't on a deal. */
export function useOpenTextThread() {
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(
    (conversationId: string, dealId: string | null | undefined) => {
      if (!dealId) {
        router.push(`/inbox?c=${conversationId}`);
        return;
      }
      const base = `/deals/${dealId}/loan-center`;
      if (pathname.startsWith(base)) {
        window.dispatchEvent(new CustomEvent<OpenTextThreadDetail>(OPEN_TEXT_THREAD_EVENT, { detail: { conversationId } }));
      } else {
        router.push(`${base}?tab=communications&c=${conversationId}`);
      }
    },
    [router, pathname]
  );
}

const draftKey = (conversationId: string) => `sms-draft:${conversationId}`;

/** An opener (the "Regarding your deal…" intro) waiting for this thread, if any. Read once. */
export function takeTextDraft(conversationId: string): string {
  try {
    const key = draftKey(conversationId);
    const draft = window.sessionStorage.getItem(key) ?? "";
    window.sessionStorage.removeItem(key);
    return draft;
  } catch {
    return "";
  }
}

interface ChatDockContextValue {
  openChat: (w: OpenChatInput) => void;
}

const ChatDockContext = createContext<ChatDockContextValue | null>(null);

/**
 * Texting an outside contact (borrower, title, insurance, lender rep…) happens in the deal's Communications
 * tab, where the loan is on screen beside the thread. Every "text this person" button goes through
 * openChat, which takes you there (and keeps any pre-filled opener for the box).
 */
export function ChatDockProvider({ children }: { children: ReactNode }) {
  const openThread = useOpenTextThread();

  const openChat = useCallback(
    (w: OpenChatInput) => {
      if (w.initialBody) {
        try {
          window.sessionStorage.setItem(draftKey(w.conversationId), w.initialBody);
        } catch {
          // no sessionStorage: the thread just opens without the opener
        }
      }
      openThread(w.conversationId, w.dealId);
    },
    [openThread]
  );

  return <ChatDockContext.Provider value={{ openChat }}>{children}</ChatDockContext.Provider>;
}

export function useChatDock() {
  const ctx = useContext(ChatDockContext);
  if (!ctx) throw new Error("useChatDock must be used within a ChatDockProvider");
  return ctx;
}
