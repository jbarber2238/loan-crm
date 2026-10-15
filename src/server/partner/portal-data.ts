import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals, partnerPayouts } from "@/server/db/schema";
import { LOAN_CATEGORIES, labelFor } from "@/lib/labels";
import { borrowerLabel, cityFrom } from "@/lib/partner-display";
import {
  type PartnerStage,
  estimatePayout,
  formatPayoutEstimate,
  partnerStageFor,
  payoutRate,
} from "@/lib/partner-comp";

export interface PortalReferral {
  id: string;
  borrower: string; // first name + last initial only
  city: string;
  dealType: string;
  stage: PartnerStage;
  estimatedPayout: string;
  payoutStatus: "none" | "pending" | "ready" | "paid";
  paidAmount: number | null;
  paidDate: Date | null;
  submittedAt: Date;
}

export interface PortalDashboard {
  referrals: PortalReferral[];
  pipelineLow: number;
  pipelineHigh: number;
  paidToDate: number;
  inFlight: number;
  awaitingPayout: number;
  hasClosed: boolean;
}

/**
 * Everything a partner may see, and nothing else: no contact details, lender,
 * rate, or notes. Scoped by the partner's own id at the query — the caller
 * passes the session's partner, never an id from the request.
 */
export async function getPartnerDashboard(partner: { id: string; tier: number }): Promise<PortalDashboard> {
  const rows = await db.query.deals.findMany({
    where: and(eq(deals.referredByAffiliateId, partner.id), isNull(deals.deletedAt)),
    orderBy: desc(deals.createdAt),
    columns: {
      id: true,
      borrowerName: true,
      propertyAddress: true,
      loanCategory: true,
      stage: true,
      loanAmountRequested: true,
      approvedLoanAmount: true,
      originationPointsOverride: true,
      brokerFeeCollected: true,
      partnerPayoutKind: true,
      createdAt: true,
    },
  });
  const payouts = await db.query.partnerPayouts.findMany({ where: eq(partnerPayouts.partnerId, partner.id) });
  const payoutByDeal = new Map(payouts.map((p) => [p.dealId, p]));

  let pipelineLow = 0;
  let pipelineHigh = 0;
  let inFlight = 0;
  let awaitingPayout = 0;
  let hasClosed = false;

  const referrals = rows.map((deal): PortalReferral => {
    const stage = partnerStageFor(deal.stage);
    const payout = payoutByDeal.get(deal.id);
    const kind = deal.partnerPayoutKind === "trailing" ? "trailing" : "first";
    const estimate = estimatePayout({
      ratePercent: payout ? Number(payout.rate) : payoutRate(kind, partner.tier),
      loanAmountRequested: Number(deal.loanAmountRequested) || 0,
      approvedLoanAmount: deal.approvedLoanAmount ? Number(deal.approvedLoanAmount) : null,
      originationPointsOverride: deal.originationPointsOverride !== null ? Number(deal.originationPointsOverride) : null,
      brokerFeeCollected: deal.brokerFeeCollected ? Number(deal.brokerFeeCollected) : null,
    });

    if (stage === "closed") {
      hasClosed = true;
      if (payout && payout.status !== "paid") awaitingPayout += Number(payout.amount ?? 0);
    } else if (stage !== "didnt_proceed") {
      inFlight++;
      if (estimate.kind === "range") {
        pipelineLow += estimate.low;
        pipelineHigh += estimate.high;
      } else {
        pipelineLow += estimate.amount;
        pipelineHigh += estimate.amount;
      }
    }

    return {
      id: deal.id,
      borrower: borrowerLabel(deal.borrowerName),
      city: cityFrom(deal.propertyAddress),
      dealType: labelFor(LOAN_CATEGORIES, deal.loanCategory),
      stage,
      estimatedPayout: payout?.status === "paid" && payout.paidAmount ? `$${Number(payout.paidAmount).toLocaleString("en-US")}` : formatPayoutEstimate(estimate),
      payoutStatus: payout ? (payout.status as "pending" | "ready" | "paid") : "none",
      paidAmount: payout?.paidAmount ? Number(payout.paidAmount) : null,
      paidDate: payout?.paidDate ?? null,
      submittedAt: deal.createdAt,
    };
  });

  const paidToDate = payouts.reduce((sum, p) => sum + (p.status === "paid" ? Number(p.paidAmount ?? 0) : 0), 0);
  return { referrals, pipelineLow, pipelineHigh, paidToDate, inFlight, awaitingPayout, hasClosed };
}
