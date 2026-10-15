import { eq } from "drizzle-orm";
import { CheckCircle2, Clock } from "lucide-react";
import { db } from "@/server/db/client";
import { partnerPayouts } from "@/server/db/schema";
import { dealOriginationFee } from "@/server/partner/payouts";
import { FeeReceivedButton, MarkPaidControl } from "@/components/deals/partner-payout-controls";
import { estimatePayout, formatPayoutEstimate, payoutRate } from "@/lib/partner-comp";
import type { DealDetail } from "@/server/data/deal-detail";

const money = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/**
 * Shown on any referred deal: who referred it, what they're owed, and (once
 * closed) the two clicks that move the money — fee received, then paid.
 */
export async function PartnerPayoutBanner({ deal, isAdmin }: { deal: DealDetail; isAdmin: boolean }) {
  const partner = deal.referredByAffiliate;
  if (!partner) return null;
  const payout = await db.query.partnerPayouts.findFirst({ where: eq(partnerPayouts.dealId, deal.id) });

  const kind = deal.partnerPayoutKind === "trailing" ? "trailing" : "first";
  const rate = payout ? Number(payout.rate) : payoutRate(kind, partner.tier);
  const estimate = estimatePayout({
    ratePercent: rate,
    loanAmountRequested: Number(deal.loanAmountRequested) || 0,
    approvedLoanAmount: deal.approvedLoanAmount ? Number(deal.approvedLoanAmount) : null,
    originationPointsOverride: deal.originationPointsOverride !== null ? Number(deal.originationPointsOverride) : null,
    brokerFeeCollected: deal.brokerFeeCollected ? Number(deal.brokerFeeCollected) : null,
  });

  const paid = payout?.status === "paid";
  const ready = payout?.status === "ready";
  const tone = paid ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-900";
  const Icon = paid ? CheckCircle2 : Clock;

  let status = "referral";
  if (paid) status = `paid ${payout?.paidDate?.toLocaleDateString() ?? ""}`;
  else if (ready) status = "ready to pay";
  else if (payout) status = deal.brokerFeeReceivedDate ? "waiting on the partner's payment details" : "waiting on our fee";

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm ${tone}`}>
      <div className="flex items-center gap-2 font-medium">
        <Icon className="size-4 shrink-0" />
        <span>
          Referred by {partner.name ?? partner.email} · {kind === "trailing" ? "repeat deal" : "first deal"} at {rate}% · payout{" "}
          {paid && payout?.paidAmount ? money(Number(payout.paidAmount)) : formatPayoutEstimate(estimate)} · {status}
        </span>
      </div>
      {isAdmin && deal.stage === "closed" && !paid && (
        <div className="flex flex-wrap items-center gap-2">
          {!deal.brokerFeeReceivedDate && <FeeReceivedButton dealId={deal.id} suggestedAmount={dealOriginationFee(deal)} />}
          {ready && payout?.amount && <MarkPaidControl payoutId={payout.id} amount={Number(payout.amount)} />}
        </div>
      )}
    </div>
  );
}
