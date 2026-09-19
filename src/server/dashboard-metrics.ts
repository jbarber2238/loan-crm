import { isNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals, dealStageEnum } from "@/server/db/schema";
import { dashboardRangeStart, type DashboardRange } from "@/lib/dashboard-ranges";

type DealWithRelations = Awaited<ReturnType<typeof fetchDeals>>[number];

function fetchDeals() {
  return db.query.deals.findMany({
    // Deleted deals are gone from every metric; archived ones still count —
    // same policy as everywhere else (see deleteDeal/archiveDeal).
    where: isNull(deals.deletedAt),
    with: {
      stageHistory: true,
      lender: true,
      pricingRequests: true,
      termSheets: true,
      referredByAffiliate: true,
    },
  });
}

function sortedHistory(deal: DealWithRelations) {
  return [...deal.stageHistory].sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
}

function inRange(date: Date, start: Date | null, end: Date): boolean {
  return (start === null || date >= start) && date <= end;
}

/** The first time this deal entered `stage` within [start, end], if any — and its index in the deal's own sorted history, so callers can look at what happened right after it. */
function firstEntryInRange(
  deal: DealWithRelations,
  stage: string,
  start: Date | null,
  end: Date
): { index: number; changedAt: Date } | null {
  const hist = sortedHistory(deal);
  const idx = hist.findIndex((h) => h.stage === stage && inRange(h.changedAt, start, end));
  if (idx === -1) return null;
  return { index: idx, changedAt: hist[idx].changedAt };
}

export interface FunnelRow {
  stage: string;
  enteredCount: number;
  nextStageCounts: { stage: string; count: number }[];
  stillHereCount: number;
}

/**
 * Data-driven, not a hardcoded state machine — the pipeline itself doesn't
 * enforce legal transitions (any stage can move to any other), so rather
 * than assume a fixed set of "legal" next stages, this reads whatever
 * actually happened next in each deal's own history. That's also more
 * useful: an unexpected bounce-back shows up here instead of being
 * silently excluded by an assumed transition map.
 */
function buildFunnel(dealsData: DealWithRelations[], start: Date | null, end: Date): FunnelRow[] {
  const rows: FunnelRow[] = [];
  for (const stage of dealStageEnum.enumValues) {
    let enteredCount = 0;
    let stillHereCount = 0;
    const nextCounts = new Map<string, number>();

    for (const deal of dealsData) {
      const entry = firstEntryInRange(deal, stage, start, end);
      if (!entry) continue;
      enteredCount++;
      const hist = sortedHistory(deal);
      const next = hist[entry.index + 1];
      if (next) {
        nextCounts.set(next.stage, (nextCounts.get(next.stage) ?? 0) + 1);
      } else {
        stillHereCount++;
      }
    }

    if (enteredCount > 0) {
      rows.push({
        stage,
        enteredCount,
        stillHereCount,
        nextStageCounts: [...nextCounts.entries()]
          .map(([stage, count]) => ({ stage, count }))
          .sort((a, b) => b.count - a.count),
      });
    }
  }
  return rows;
}

export interface LenderLossRow {
  lenderId: string;
  lenderName: string;
  reachedApplication: number;
  lostOrDisqualified: number;
}

/** Of deals that reached Application (in range) with a lender actually chosen, how many ended Lost/Disqualified — broken out by that lender. */
function buildLenderLoss(dealsData: DealWithRelations[], start: Date | null, end: Date): LenderLossRow[] {
  const byLender = new Map<string, LenderLossRow>();

  for (const deal of dealsData) {
    if (!deal.lenderId || !deal.lender) continue;
    if (!firstEntryInRange(deal, "application", start, end)) continue;

    const row = byLender.get(deal.lenderId) ?? {
      lenderId: deal.lenderId,
      lenderName: deal.lender.name,
      reachedApplication: 0,
      lostOrDisqualified: 0,
    };
    row.reachedApplication++;
    if (deal.stage === "lost" || deal.stage === "disqualified") row.lostOrDisqualified++;
    byLender.set(deal.lenderId, row);
  }

  return [...byLender.values()].sort((a, b) => b.reachedApplication - a.reachedApplication);
}

export interface LenderPerformanceRow {
  lenderId: string;
  lenderName: string;
  priced: number;
  chosen: number;
  closed: number;
}

/** Priced-with vs. actually-chosen vs. actually-closed, per lender — a broader win-rate view than just the application-stage losses above. */
function buildLenderPerformance(
  dealsData: DealWithRelations[],
  start: Date | null,
  end: Date,
  lenderNames: Map<string, string>
): LenderPerformanceRow[] {
  const byLender = new Map<string, LenderPerformanceRow>();
  const getRow = (lenderId: string, lenderName: string) => {
    let row = byLender.get(lenderId);
    if (!row) {
      row = { lenderId, lenderName, priced: 0, chosen: 0, closed: 0 };
      byLender.set(lenderId, row);
    }
    return row;
  };

  for (const deal of dealsData) {
    // Priced: this deal had a pricing request sent to this lender, sent (or
    // drafted, if never actually sent) within the range.
    const pricedLenderIds = new Set<string>();
    for (const req of deal.pricingRequests) {
      const at = req.sentAt ?? req.createdAt;
      if (inRange(at, start, end)) pricedLenderIds.add(req.lenderId);
    }
    for (const lenderId of pricedLenderIds) {
      const row = getRow(lenderId, lenderNames.get(lenderId) ?? "Unknown lender");
      row.priced++;
    }

    // Chosen: the term sheet actually accepted for this deal, at the
    // moment it was accepted (termSheets.acceptedAt) — a real, precise
    // timestamp, unlike deals.lenderId which carries no date of its own.
    const accepted = deal.termSheets.find((t) => t.status === "accepted" && t.acceptedAt);
    if (accepted && deal.lenderId && deal.lender && inRange(accepted.acceptedAt!, start, end)) {
      const row = getRow(deal.lenderId, deal.lender.name);
      row.chosen++;

      if (firstEntryInRange(deal, "closed", start, end)) {
        row.closed++;
      }
    }
  }

  return [...byLender.values()]
    .filter((r) => r.priced > 0 || r.chosen > 0)
    .sort((a, b) => b.chosen - a.chosen);
}

export interface ReferralPerformanceRow {
  affiliateId: string;
  affiliateName: string;
  referrals: number;
  closed: number;
  feesPaid: number;
  feesPending: number;
}

function buildReferralPerformance(dealsData: DealWithRelations[], start: Date | null, end: Date): ReferralPerformanceRow[] {
  const byAffiliate = new Map<string, ReferralPerformanceRow>();

  for (const deal of dealsData) {
    if (!deal.referredByAffiliateId || !deal.referredByAffiliate) continue;

    const row = byAffiliate.get(deal.referredByAffiliateId) ?? {
      affiliateId: deal.referredByAffiliateId,
      affiliateName: deal.referredByAffiliate.name ?? deal.referredByAffiliate.email,
      referrals: 0,
      closed: 0,
      feesPaid: 0,
      feesPending: 0,
    };

    if (inRange(deal.createdAt, start, end)) row.referrals++;

    const closedEntry = firstEntryInRange(deal, "closed", start, end);
    if (closedEntry) {
      row.closed++;
      if (deal.referralFeeEligible) {
        if (deal.referralFeePaidAt) row.feesPaid++;
        else row.feesPending++;
      }
    }

    byAffiliate.set(deal.referredByAffiliateId, row);
  }

  return [...byAffiliate.values()].sort((a, b) => b.referrals - a.referrals);
}

export interface VolumeSummary {
  closedCount: number;
  totalVolume: number;
  averageLoanSize: number;
}

function buildVolume(dealsData: DealWithRelations[], start: Date | null, end: Date): VolumeSummary {
  const closedAmounts: number[] = [];
  for (const deal of dealsData) {
    if (!firstEntryInRange(deal, "closed", start, end)) continue;
    const amount = deal.approvedLoanAmount ?? deal.loanAmountRequested;
    closedAmounts.push(Number(amount));
  }
  const totalVolume = closedAmounts.reduce((sum, n) => sum + n, 0);
  return {
    closedCount: closedAmounts.length,
    totalVolume,
    averageLoanSize: closedAmounts.length ? totalVolume / closedAmounts.length : 0,
  };
}

export interface SpeedRow {
  loanCategory: string;
  closedCount: number;
  averageDaysToClose: number;
}

function buildSpeed(dealsData: DealWithRelations[], start: Date | null, end: Date): SpeedRow[] {
  const byCategory = new Map<string, number[]>();
  for (const deal of dealsData) {
    const entry = firstEntryInRange(deal, "closed", start, end);
    if (!entry) continue;
    const days = (entry.changedAt.getTime() - deal.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const list = byCategory.get(deal.loanCategory) ?? [];
    list.push(days);
    byCategory.set(deal.loanCategory, list);
  }

  return [...byCategory.entries()]
    .map(([loanCategory, days]) => ({
      loanCategory,
      closedCount: days.length,
      averageDaysToClose: days.reduce((sum, d) => sum + d, 0) / days.length,
    }))
    .sort((a, b) => b.closedCount - a.closedCount);
}

export interface DashboardData {
  funnel: FunnelRow[];
  lenderLoss: LenderLossRow[];
  lenderPerformance: LenderPerformanceRow[];
  referralPerformance: ReferralPerformanceRow[];
  volume: VolumeSummary;
  speed: SpeedRow[];
}

export async function buildDashboardData(range: DashboardRange): Promise<DashboardData> {
  const start = dashboardRangeStart(range);
  const end = new Date();
  const [dealsData, allLenders] = await Promise.all([fetchDeals(), db.query.lenders.findMany()]);
  const lenderNames = new Map(allLenders.map((l) => [l.id, l.name]));

  return {
    funnel: buildFunnel(dealsData, start, end),
    lenderLoss: buildLenderLoss(dealsData, start, end),
    lenderPerformance: buildLenderPerformance(dealsData, start, end, lenderNames),
    referralPerformance: buildReferralPerformance(dealsData, start, end),
    volume: buildVolume(dealsData, start, end),
    speed: buildSpeed(dealsData, start, end),
  };
}
