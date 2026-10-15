import Link from "next/link";
import { getPartnerPayoutQueue } from "@/server/partner/queue";
import { FeeReceivedButton, MarkPaidControl } from "@/components/deals/partner-payout-controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** The dashboard's referral-payout queue: every payout still owed, with the one-click action each needs. */
export async function PartnerPayoutWidget() {
  const queue = await getPartnerPayoutQueue();
  const ready = queue.filter((q) => q.status === "ready");

  return (
    <Card size="sm" className="h-fit">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm">Referral payouts</CardTitle>
        {ready.length > 0 ? <Badge variant="success">{ready.length} ready to pay</Badge> : <Badge variant="secondary">{queue.length} open</Badge>}
      </CardHeader>
      <CardContent className="max-h-[28rem] space-y-3 overflow-y-auto">
        {queue.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing owed. A payout shows up here when a referral closes.</p>
        )}
        {queue.map((q) => (
          <div key={q.id} className="space-y-2 rounded-md border p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{q.partnerName}</p>
                <Link href={`/deals/${q.dealId}`} className="block truncate text-xs text-muted-foreground underline underline-offset-2">
                  {q.street} · {q.borrower}
                </Link>
              </div>
              <span className="shrink-0 font-semibold">{q.amount !== null ? money(q.amount) : "—"}</span>
            </div>
            {q.status === "ready" && q.amount !== null ? (
              <MarkPaidControl payoutId={q.id} amount={q.amount} compact />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Waiting on: {q.waitingOn}</span>
                {!q.feeReceived && <FeeReceivedButton dealId={q.dealId} suggestedAmount={q.suggestedFee} />}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
