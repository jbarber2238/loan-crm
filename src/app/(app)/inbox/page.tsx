import { db } from "@/server/db/client";
import { getUnmatchedConversations } from "@/server/actions/messages";
import { InboxList } from "@/components/inbox/inbox-list";

export default async function InboxPage() {
  const [conversations, allDeals] = await Promise.all([
    getUnmatchedConversations(),
    db.query.deals.findMany({
      columns: { id: true, loanNumber: true, borrowerName: true, propertyAddress: true },
      orderBy: (d, { desc }) => desc(d.createdAt),
    }),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Inbox</h1>
        <p className="text-sm text-muted-foreground">
          Calls and texts that don&apos;t match any deal yet — a wrong number, or a brand-new lead. Attach one to an
          existing deal, or start a new one from it.
        </p>
      </div>
      <InboxList conversations={conversations} allDeals={allDeals} />
    </div>
  );
}
