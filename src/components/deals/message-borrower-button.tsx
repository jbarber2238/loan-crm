"use client";

import { useTransition } from "react";
import { MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { prepareBorrowerConversation } from "@/server/actions/messages";
import { useChatDock } from "@/components/messaging/chat-dock-context";

/** Opens the floating chat dock for this deal's borrower instead of navigating anywhere — the whole point being you never leave the deal you're looking at. */
export function MessageBorrowerButton({ dealId }: { dealId: string }) {
  const { openChat } = useChatDock();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      try {
        const prepared = await prepareBorrowerConversation(dealId);
        openChat({
          conversationId: prepared.conversationId,
          contactName: prepared.borrowerName,
          contactPhone: prepared.borrowerPhone,
          contactType: "Borrower",
          initialBody: prepared.initialBody,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't open messages");
      }
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      title="Message borrower"
      aria-label="Message borrower"
      disabled={isPending}
      onClick={handleClick}
    >
      <MessageSquare className="size-3.5" />
    </Button>
  );
}
