import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals, partnerEvents, partnerPayouts } from "@/server/db/schema";
import { LOAN_CATEGORIES, labelFor } from "@/lib/labels";
import { borrowerDisplay } from "@/lib/partner-display";
import {
  type PartnerStage,
  estimatePayout,
  partnerStageFor,
  payoutRate,
} from "@/lib/partner-comp";
import { type StageBucket, activityLine, bucketFor, shortDate } from "@/lib/partner-dashboard";

export interface PortalReferral {
  id: string;
  borrower: string; // the borrower's company when there is one, otherwise first name + last initial
  referredOn: string;
  loanType: string;
  loanAmount: number;
  stage: PartnerStage;
  bucket: StageBucket;
  payoutText: string;
  payoutNote: string;
  payoutStatus: "none" | "pending" | "ready" | "paid";
}

export interface PortalActivity {
  date: string;
  text: string;
  paid: boolean;
}

export interface PortalDashboard {
  referrals: PortalReferral[];
  pipelineLow: number;
  pipelineHigh: number;
  paidToDate: number;
  paidCount: number;
  inFlight: number;
  awaitingPayout: number;
  hasClosed: boolean;
  bucketCounts: Record<"submitted" | "review" | "closing" | "funded", number>;
  fundedCount: number;
  activity: PortalActivity[];
}

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

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
      borrowerEntityName: true,
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
  const bucketCounts = { submitted: 0, review: 0, closing: 0, funded: 0 };

  const referrals = rows.map((deal): PortalReferral => {
    const stage = partnerStageFor(deal.stage);
    const bucket = bucketFor(stage);
    if (bucket === "submitted" || bucket === "review" || bucket === "closing" || bucket === "funded") bucketCounts[bucket]++;

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

    let payoutText: string;
    let payoutNote: string;
    if (payout?.status === "paid" && payout.paidAmount) {
      payoutText = money(Number(payout.paidAmount));
      payoutNote = `Paid ${payout.paidDate ? shortDate(payout.paidDate, "UTC") : ""} by ACH`.replace("  ", " ");
    } else if (stage === "didnt_proceed") {
      payoutText = "—";
      payoutNote = "Didn't proceed";
    } else {
      payoutText = estimate.kind === "range" ? (estimate.low === estimate.high ? money(estimate.low) : `${money(estimate.low)}–${money(estimate.high)}`) : money(estimate.amount);
      payoutNote =
        stage === "closed"
          ? payout?.status === "ready"
            ? "Paying within 5 business days"
            : "Paid after our fee arrives"
          : estimate.kind === "range"
            ? "Estimated range · paid after funding"
            : "Estimated · paid after funding";
    }

    return {
      id: deal.id,
      borrower: borrowerDisplay(deal.borrowerEntityName, deal.borrowerName),
      referredOn: shortDate(deal.createdAt),
      loanType: labelFor(LOAN_CATEGORIES, deal.loanCategory),
      loanAmount: Number(deal.approvedLoanAmount) || Number(deal.loanAmountRequested) || 0,
      stage,
      bucket,
      payoutText,
      payoutNote,
      payoutStatus: payout ? (payout.status as "pending" | "ready" | "paid") : "none",
    };
  });

  const paid = payouts.filter((p) => p.status === "paid");
  const paidToDate = paid.reduce((sum, p) => sum + Number(p.paidAmount ?? 0), 0);

  const labelByDeal = new Map(rows.map((r) => [r.id, borrowerDisplay(r.borrowerEntityName, r.borrowerName)]));
  const events = await db.query.partnerEvents.findMany({
    where: and(eq(partnerEvents.partnerId, partner.id), inArray(partnerEvents.type, ["referral_submitted", "stage_change", "payout_paid"])),
    orderBy: desc(partnerEvents.createdAt),
    limit: 60,
  });
  const activity: PortalActivity[] = [];
  for (const e of events) {
    const line = activityLine({ type: e.type, payload: e.payload, dealLabel: e.dealId ? (labelByDeal.get(e.dealId) ?? null) : null });
    if (line) activity.push({ date: shortDate(e.createdAt), text: line.text, paid: line.paid });
    if (activity.length === 8) break;
  }

  return {
    referrals,
    pipelineLow,
    pipelineHigh,
    paidToDate,
    paidCount: paid.length,
    inFlight,
    awaitingPayout,
    hasClosed,
    bucketCounts,
    fundedCount: bucketCounts.funded,
    activity,
  };
}
