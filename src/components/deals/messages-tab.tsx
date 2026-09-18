"use client";

import { sendDealMessage } from "@/server/actions/messages";
import { initiateDealCall } from "@/server/actions/calls";
import { ConversationThread } from "@/components/inbox/conversation-thread";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
  primaryPhone: string;
  messages: Message[];
  callLogs: CallLog[];
  participants: Participant[];
}

export function MessagesTab({
  dealId,
  borrowerPhone,
  borrowerName,
  conversation,
}: {
  dealId: string;
  borrowerPhone: string | null;
  borrowerName: string;
  conversation: Conversation | null;
}) {
  if (!borrowerPhone) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Messages</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No phone number on file for {borrowerName} yet — add one on the Overview tab before texting or calling.
          </p>
        </CardContent>
      </Card>
    );
  }

  // A conversation attached from the Inbox can be on a different number
  // than the deal's own borrowerPhone on file (that's the whole point of
  // "attach to existing deal" — an existing borrower called from a number
  // that wasn't on file yet), so the conversation's own phone is the source
  // of truth for who's actually being texted/called, not the deal's field.
  const activePhone = conversation?.primaryPhone ?? borrowerPhone;

  return (
    <ConversationThread
      title={`Messages — ${activePhone}`}
      primaryLabel={`${borrowerName} — ${activePhone}`}
      conversation={conversation}
      sendMessage={sendDealMessage.bind(null, dealId)}
      onCall={initiateDealCall.bind(null, dealId)}
    />
  );
}
