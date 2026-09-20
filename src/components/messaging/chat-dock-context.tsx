"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export type ContactType = "Borrower" | "Insurance" | "Title" | "Lender Rep" | "Referral Partner" | "Other";

export interface DockWindow {
  conversationId: string;
  contactName: string;
  contactPhone: string;
  contactType: ContactType;
  minimized: boolean;
  initialBody?: string;
}

type OpenChatInput = {
  conversationId: string;
  contactName: string;
  contactPhone: string;
  contactType: ContactType;
  initialBody?: string;
};

interface ChatDockContextValue {
  windows: DockWindow[];
  openChat: (w: OpenChatInput) => void;
  closeChat: (conversationId: string) => void;
  minimizeChat: (conversationId: string) => void;
  restoreChat: (conversationId: string) => void;
}

const ChatDockContext = createContext<ChatDockContextValue | null>(null);

/**
 * Global floating-chat state, mounted once in the (app) layout so it
 * survives client-side navigation between pages — clicking "Message
 * Borrower" from a deal never navigates away, it just opens a window here.
 * Deliberately in-memory only (no localStorage): a hard refresh clearing it
 * is an acceptable tradeoff for not needing to persist stale window state.
 */
export function ChatDockProvider({ children }: { children: ReactNode }) {
  const [windows, setWindows] = useState<DockWindow[]>([]);

  const openChat = useCallback((w: OpenChatInput) => {
    setWindows((prev) => {
      const existing = prev.find((x) => x.conversationId === w.conversationId);
      if (existing) {
        return prev.map((x) => (x.conversationId === w.conversationId ? { ...x, minimized: false } : x));
      }
      return [...prev, { ...w, minimized: false }];
    });
  }, []);

  const closeChat = useCallback((conversationId: string) => {
    setWindows((prev) => prev.filter((x) => x.conversationId !== conversationId));
  }, []);

  const minimizeChat = useCallback((conversationId: string) => {
    setWindows((prev) => prev.map((x) => (x.conversationId === conversationId ? { ...x, minimized: true } : x)));
  }, []);

  const restoreChat = useCallback((conversationId: string) => {
    setWindows((prev) => prev.map((x) => (x.conversationId === conversationId ? { ...x, minimized: false } : x)));
  }, []);

  return (
    <ChatDockContext.Provider value={{ windows, openChat, closeChat, minimizeChat, restoreChat }}>
      {children}
    </ChatDockContext.Provider>
  );
}

export function useChatDock() {
  const ctx = useContext(ChatDockContext);
  if (!ctx) throw new Error("useChatDock must be used within a ChatDockProvider");
  return ctx;
}
