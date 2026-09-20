import { db } from "@/server/db/client";
import { getAllConversations } from "@/server/actions/messages";
import { CommunicationsView } from "@/components/inbox/communications-view";

export default async function CommunicationsPage() {
  const [conversations, allDeals] = await Promise.all([
    getAllConversations(),
    db.query.deals.findMany({
      columns: { id: true, loanNumber: true, borrowerName: true, propertyAddress: true },
      orderBy: (d, { desc }) => desc(d.createdAt),
    }),
  ]);

  return (
    <div className="h-[calc(100vh-2rem)] md:h-[calc(100vh-3rem)]">
      <CommunicationsView conversations={conversations} allDeals={allDeals} />
    </div>
  );
}
