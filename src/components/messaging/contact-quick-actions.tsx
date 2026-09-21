"use client";

import { useTransition } from "react";
import { MessageSquare, Phone as PhoneIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { prepareContactConversation, type ContactType } from "@/server/actions/messages";
import { initiateConversationCall } from "@/server/actions/calls";
import { useChatDock } from "@/components/messaging/chat-dock-context";

/**
 * The call + text icon pair meant to sit next to any phone number in the
 * app — a lender rep, a referral partner, a deal's insurance/title agent,
 * not just borrowers. Text opens the floating chat dock in place; call
 * rings the dock's shared conversation directly (no need to open the
 * window first) since there's nothing to type for a call.
 */
export function ContactQuickActions({
  phone,
  name,
  contactType,
  dealId,
}: {
  phone: string | null | undefined;
  name: string;
  contactType: ContactType;
  dealId?: string;
}) {
  const { openChat } = useChatDock();
  const [isPending, startTransition] = useTransition();

  if (!phone) return null;

  function handleMessage() {
    startTransition(async () => {
      try {
        const prepared = await prepareContactConversation({ phone: phone!, dealId });
        openChat({
          conversationId: prepared.conversationId,
          contactName: name,
          contactPhone: prepared.phone,
          contactType,
          initialBody: prepared.initialBody,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't open messages");
      }
    });
  }

  function handleCall() {
    startTransition(async () => {
      try {
        const prepared = await prepareContactConversation({ phone: phone!, dealId });
        const result = await initiateConversationCall(prepared.conversationId);
        if (result.ok) toast.success("Calling your phone now — you'll be connected once you pick up.");
        else toast.error(result.message ?? "Failed to start call");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to start call");
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-0.5">
      <Button type="button" variant="ghost" size="icon-sm" title={`Call ${name}`} aria-label={`Call ${name}`} disabled={isPending} onClick={handleCall}>
        <PhoneIcon className="size-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        title={`Message ${name}`}
        aria-label={`Message ${name}`}
        disabled={isPending}
        onClick={handleMessage}
      >
        <MessageSquare className="size-3.5" />
      </Button>
    </span>
  );
}
