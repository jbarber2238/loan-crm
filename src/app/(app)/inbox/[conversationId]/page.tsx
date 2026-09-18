import { notFound } from "next/navigation";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { dealConversations } from "@/server/db/schema";
import { sendConversationMessage } from "@/server/actions/messages";
import { initiateConversationCall } from "@/server/actions/calls";
import { ConversationThread } from "@/components/inbox/conversation-thread";

export default async function InboxConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;

  const conversation = await db.query.dealConversations.findFirst({
    where: eq(dealConversations.id, conversationId),
    with: {
      messages: { orderBy: (m, { asc }) => asc(m.createdAt) },
      callLogs: { orderBy: (c, { asc }) => asc(c.startedAt) },
      participants: true,
    },
  });
  if (!conversation) notFound();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href="/inbox" className="text-sm text-muted-foreground hover:underline">
        ← Inbox
      </Link>
      <ConversationThread
        title={`Conversation — ${conversation.primaryPhone}`}
        primaryLabel={conversation.primaryPhone}
        conversation={conversation}
        sendMessage={sendConversationMessage.bind(null, conversationId)}
        onCall={initiateConversationCall.bind(null, conversationId)}
      />
    </div>
  );
}
