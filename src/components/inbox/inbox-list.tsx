"use client";

import Link from "next/link";
import { useState } from "react";
import { attachConversationToDeal } from "@/server/actions/messages";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Conversation {
  id: string;
  primaryPhone: string;
  lastMessageAt: Date | string;
  messages: { body: string; direction: "inbound" | "outbound"; createdAt: Date | string }[];
  callLogs: { direction: "inbound" | "outbound"; status: string; startedAt: Date | string }[];
  participants: { id: string; name: string | null; phone: string }[];
}

interface DealOption {
  id: string;
  loanNumber: number;
  borrowerName: string;
  propertyAddress: string;
}

export function InboxList({ conversations, allDeals }: { conversations: Conversation[]; allDeals: DealOption[] }) {
  const [attachingId, setAttachingId] = useState<string | null>(null);

  if (conversations.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing unmatched right now.</p>;
  }

  return (
    <div className="space-y-2">
      {conversations.map((c) => {
        const lastMessage = c.messages[0];
        const lastCall = c.callLogs[0];
        const preview = lastMessage
          ? `${lastMessage.direction === "inbound" ? "" : "You: "}${lastMessage.body}`
          : lastCall
            ? `${lastCall.direction === "inbound" ? "Incoming" : "Outgoing"} call — ${lastCall.status}`
            : "No activity yet";

        return (
          <Card key={c.id}>
            <CardContent className="space-y-3 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{c.primaryPhone}</p>
                  <p className="text-sm text-muted-foreground line-clamp-1">{preview}</p>
                  {c.participants.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      + {c.participants.map((p) => p.name ?? p.phone).join(", ")}
                    </p>
                  )}
                </div>
                <p className="shrink-0 text-xs text-muted-foreground">
                  {new Date(c.lastMessageAt).toLocaleString()}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <Button asChild size="sm" variant="outline">
                  <Link href={`/inbox/${c.id}`}>View / reply</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/deals/new?phone=${encodeURIComponent(c.primaryPhone)}&conversationId=${c.id}`}>
                    Start new deal
                  </Link>
                </Button>
                {attachingId === c.id ? (
                  <ActionForm
                    action={attachConversationToDeal.bind(null, c.id)}
                    successMessage="Attached to deal"
                    className="flex items-center gap-2"
                  >
                    <Select name="dealId" required>
                      <SelectTrigger className="w-64">
                        <SelectValue placeholder="Select a deal" />
                      </SelectTrigger>
                      <SelectContent>
                        {allDeals.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            #{d.loanNumber} — {d.borrowerName} — {d.propertyAddress}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <SubmitButton size="sm">Attach</SubmitButton>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setAttachingId(null)}>
                      Cancel
                    </Button>
                  </ActionForm>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setAttachingId(c.id)}>
                    Attach to existing deal
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
