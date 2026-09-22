"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Mail, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ComposeFields, type EmailComposeState } from "@/components/emails/compose-fields";
import { previewIntroEmail, sendIntroEmail, prepareIntroText } from "@/server/actions/borrower-intro";
import { useChatDock } from "@/components/messaging/chat-dock-context";

/**
 * "Send Intro Email"/"Send Intro Text" — a processor's one-click way to
 * send the personal introduction they set up in My Profile. Email opens a
 * normal preview-and-edit dialog like every other borrower email; text
 * reuses the existing floating chat dock (prefilled, not auto-sent) rather
 * than a separate send path.
 */
export function IntroButtons({ dealId }: { dealId: string }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, startSend] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [compose, setCompose] = useState<EmailComposeState | null>(null);
  const [textPending, startTextTransition] = useTransition();
  const { openChat } = useChatDock();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setError(null);
    setCompose(null);
    setLoading(true);
    previewIntroEmail(dealId)
      .then(setCompose)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't build this email."))
      .finally(() => setLoading(false));
  }

  function handleSend() {
    if (!compose) return;
    setError(null);
    const finalBody = bodyRef.current?.innerHTML ?? compose.body;
    startSend(async () => {
      try {
        await sendIntroEmail(dealId, compose.to, compose.cc, compose.subject, finalBody);
        setOpen(false);
        toast.success("Intro email sent");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Couldn't send this email.";
        setError(message);
        toast.error(message);
      }
    });
  }

  function handleSendText() {
    startTextTransition(async () => {
      try {
        const prepared = await prepareIntroText(dealId);
        openChat({
          conversationId: prepared.conversationId,
          contactName: prepared.contactName,
          contactPhone: prepared.contactPhone,
          contactType: "Borrower",
          initialBody: prepared.body,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't open the intro text");
      }
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <Mail className="size-3.5" />
            Send Intro Email
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Send intro email</DialogTitle>
          </DialogHeader>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : error && !compose ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : compose ? (
            <div className="space-y-3">
              <ComposeFields idPrefix="intro-email" compose={compose} setCompose={setCompose} bodyRef={bodyRef} />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="button" className="w-full" disabled={sending} onClick={handleSend}>
                {sending ? "Sending…" : "Send"}
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Button type="button" variant="outline" size="sm" disabled={textPending} onClick={handleSendText}>
        <MessageSquare className="size-3.5" />
        Send Intro Text
      </Button>
    </div>
  );
}
