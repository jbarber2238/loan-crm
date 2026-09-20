"use client";

import { useEffect, useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { searchBorrowers, prepareBorrowerConversation, type BorrowerSearchResult } from "@/server/actions/messages";
import { useChatDock } from "@/components/messaging/chat-dock-context";
import { STAGES, labelFor } from "@/lib/labels";

export function NewMessagePopover({ onClose }: { onClose: () => void }) {
  const { openChat } = useChatDock();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<BorrowerSearchResult[]>([]);
  const [isPending, startTransition] = useTransition();

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (trimmedQuery.length < 2) return;
    const handle = setTimeout(() => {
      startTransition(async () => {
        setResults(await searchBorrowers(trimmedQuery));
      });
    }, 250);
    return () => clearTimeout(handle);
  }, [trimmedQuery]);

  function pick(result: BorrowerSearchResult) {
    startTransition(async () => {
      const prepared = await prepareBorrowerConversation(result.dealId);
      openChat({
        conversationId: prepared.conversationId,
        borrowerName: prepared.borrowerName,
        borrowerPhone: prepared.borrowerPhone,
        initialBody: prepared.initialBody,
      });
      onClose();
    });
  }

  return (
    <div className="flex h-[420px] w-80 flex-col rounded-t-lg border border-b-0 bg-popover shadow-xl">
      <div className="flex items-center justify-between rounded-t-lg border-b bg-muted px-3 py-2">
        <p className="text-sm font-semibold">New message</p>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="border-b p-2">
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Borrower name…"
          className="h-8"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {trimmedQuery.length < 2 && <p className="p-2 text-center text-xs text-muted-foreground">Type at least 2 characters.</p>}
        {trimmedQuery.length >= 2 && !isPending && results.length === 0 && (
          <p className="p-2 text-center text-xs text-muted-foreground">No borrowers found.</p>
        )}
        <div className="space-y-1">
          {trimmedQuery.length >= 2 &&
            results.map((r) => (
            <button
              key={r.dealId}
              onClick={() => pick(r)}
              className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
            >
              <p className="font-medium">{r.borrowerName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {r.propertyAddress} · {labelFor(STAGES, r.stage)}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
