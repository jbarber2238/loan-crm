import { notFound } from "next/navigation";
import { getDealDetail } from "@/server/data/deal-detail";
import { db } from "@/server/db/client";
import { dealConversations } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { MessagesTab } from "@/components/deals/messages-tab";

export default async function DealMessagesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const deal = await getDealDetail(id);
  if (!deal) notFound();

  const conversation = await db.query.dealConversations.findFirst({
    where: eq(dealConversations.dealId, id),
    with: {
      messages: { orderBy: (m, { asc }) => asc(m.createdAt) },
      callLogs: { orderBy: (c, { asc }) => asc(c.startedAt) },
      participants: true,
    },
  });

  return (
    <MessagesTab
      dealId={id}
      borrowerPhone={deal.borrowerPhone}
      borrowerName={deal.borrowerName}
      conversation={conversation ?? null}
    />
  );
}
