"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Phone } from "lucide-react";
import { addConversationParticipant, removeConversationParticipant } from "@/server/actions/messages";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Message {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  createdAt: Date | string;
}

interface CallLog {
  id: string;
  direction: "inbound" | "outbound";
  status: string;
  startedAt: Date | string;
  durationSeconds: number | null;
  recordingUrl: string | null;
}

interface Participant {
  id: string;
  name: string | null;
  phone: string;
}

interface Conversation {
  id: string;
  messages: Message[];
  callLogs: CallLog[];
  participants: Participant[];
}

type TimelineItem = { kind: "message"; at: Date; item: Message } | { kind: "call"; at: Date; item: CallLog };

/**
 * The shared texting/calling thread UI, at src/app/(app)/inbox/[conversationId] —
 * the one borrower conversation, whether it's still unmatched to any deal
 * or has several. "Message Borrower" from a deal's header lands here too
 * (see openBorrowerConversation), rather than a separate per-deal thread.
 */
export function ConversationThread({
  title,
  primaryLabel,
  conversation,
  sendMessage,
  onCall,
  initialBody,
}: {
  title: string;
  primaryLabel: string;
  conversation: Conversation | null;
  sendMessage: (formData: FormData) => Promise<void>;
  onCall: () => Promise<{ ok: boolean; message?: string }>;
  initialBody?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [body, setBody] = useState(initialBody ?? "");
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const timeline: TimelineItem[] = conversation
    ? [
        ...conversation.messages.map((m): TimelineItem => ({ kind: "message", at: new Date(m.createdAt), item: m })),
        ...conversation.callLogs.map((c): TimelineItem => ({ kind: "call", at: new Date(c.startedAt), item: c })),
      ].sort((a, b) => a.at.getTime() - b.at.getTime())
    : [];

  function handleSend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!body.trim()) return;
    const formData = new FormData();
    formData.set("body", body);
    startTransition(async () => {
      try {
        await sendMessage(formData);
        setBody("");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to send");
      }
    });
  }

  function handleCall() {
    startTransition(async () => {
      try {
        const result = await onCall();
        if (result.ok) {
          toast.success("Calling your phone now — you'll be connected once you pick up.");
          router.refresh();
        } else {
          toast.error(result.message ?? "Failed to start call");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to start call");
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{title}</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={handleCall} disabled={isPending}>
            <Phone className="size-4" />
            Call
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-h-[28rem] space-y-2 overflow-y-auto rounded-md border p-3">
            {timeline.length === 0 && <p className="text-sm text-muted-foreground">No messages or calls yet.</p>}
            {timeline.map((entry) =>
              entry.kind === "message" ? (
                <div
                  key={entry.item.id}
                  className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    entry.item.direction === "outbound" ? "ml-auto bg-primary/10" : "bg-muted"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{entry.item.body}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{entry.at.toLocaleString()}</p>
                </div>
              ) : (
                <div
                  key={entry.item.id}
                  className="mx-auto max-w-[90%] rounded-md bg-muted/50 px-3 py-1.5 text-center text-xs text-muted-foreground"
                >
                  {entry.item.direction === "outbound" ? "Outgoing call" : "Incoming call"} — {entry.item.status}
                  {entry.item.durationSeconds ? ` (${Math.round(entry.item.durationSeconds / 60)} min)` : ""}
                  {entry.item.recordingUrl && (
                    <>
                      {" — "}
                      <a href={entry.item.recordingUrl} target="_blank" rel="noreferrer" className="underline">
                        voicemail
                      </a>
                    </>
                  )}
                  <span className="ml-1">{entry.at.toLocaleString()}</span>
                </div>
              )
            )}
          </div>

          <form ref={formRef} onSubmit={handleSend} className="flex items-end gap-2">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={2}
              placeholder="Type a message..."
              className="flex-1"
            />
            <Button type="submit" disabled={isPending || !body.trim()}>
              Send
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Participants</CardTitle>
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddParticipant((v) => !v)}>
            Add someone
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="rounded-md border px-3 py-2 text-sm">{primaryLabel}</div>
          {conversation?.participants.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>
                {p.name ?? "Unnamed"} — {p.phone}
              </span>
              <ActionForm action={removeConversationParticipant.bind(null, p.id)} successMessage="Removed">
                <SubmitButton size="sm" variant="ghost">
                  Remove
                </SubmitButton>
              </ActionForm>
            </div>
          ))}
          {showAddParticipant && conversation && (
            <ActionForm
              action={addConversationParticipant.bind(null, conversation.id)}
              successMessage="Added to this conversation"
              className="flex items-end gap-2 border-t pt-3"
              onSuccess={() => setShowAddParticipant(false)}
            >
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="participant-name">Name</Label>
                <Input id="participant-name" name="name" placeholder="Optional" />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="participant-phone">Phone</Label>
                <Input id="participant-phone" name="phone" type="tel" required />
              </div>
              <SubmitButton size="sm">Add</SubmitButton>
            </ActionForm>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
