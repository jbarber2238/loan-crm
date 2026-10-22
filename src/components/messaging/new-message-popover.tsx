"use client";

import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchContacts, prepareContactConversation, type ContactSearchResult } from "@/server/actions/messages";
import { useChatDock } from "@/components/messaging/chat-dock-context";

export function NewMessagePopover({ onClose }: { onClose: () => void }) {
  const { openChat } = useChatDock();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ContactSearchResult[]>([]);
  const [isPending, startTransition] = useTransition();

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (trimmedQuery.length < 2) return;
    const handle = setTimeout(() => {
      startTransition(async () => {
        setResults(await searchContacts(trimmedQuery));
      });
    }, 250);
    return () => clearTimeout(handle);
  }, [trimmedQuery]);

  function pick(result: ContactSearchResult) {
    startTransition(async () => {
      const prepared = await prepareContactConversation({ phone: result.phone, dealId: result.dealId });
      openChat({
        conversationId: prepared.conversationId,
        contactName: result.name,
        contactPhone: prepared.phone,
        contactType: result.contactType,
        initialBody: prepared.initialBody,
      });
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex h-dvh w-screen flex-col bg-popover sm:static sm:z-auto sm:h-[min(420px,70vh)] sm:w-80 sm:rounded-t-lg sm:border sm:border-b-0 sm:shadow-xl">
      <div className="flex items-center justify-between border-b bg-muted px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:rounded-t-lg sm:pt-2">
        <p className="text-base font-semibold sm:text-sm">New message</p>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="border-b p-2">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name — borrower, lender rep, title, insurance…"
          className="h-11 text-base sm:h-8 sm:text-sm"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {trimmedQuery.length < 2 && <p className="p-2 text-center text-xs text-muted-foreground">Type at least 2 characters.</p>}
        {trimmedQuery.length >= 2 && !isPending && results.length === 0 && (
          <p className="p-2 text-center text-xs text-muted-foreground">No contacts found.</p>
        )}
        <div className="space-y-1">
          {trimmedQuery.length >= 2 &&
            results.map((r) => (
              <button
                key={r.key}
                onClick={() => pick(r)}
                className="w-full rounded-md px-2 py-2.5 text-left text-sm hover:bg-muted sm:py-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-medium">{r.name}</p>
                  <span className="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {r.contactType}
                  </span>
                </div>
                {r.subtitle && <p className="truncate text-xs text-muted-foreground">{r.subtitle}</p>}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
