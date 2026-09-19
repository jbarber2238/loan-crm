import { eq, isNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals, dealStageEnum, companySettings } from "@/server/db/schema";
import { dashboardRangeStart, type DashboardRange } from "@/lib/dashboard-ranges";
import { leadValueFor, isDscrLikeCategory, estimatedMonthlyPI, estimatedMonthlyPitia, calculateDscrRatio } from "@/lib/term-sheet-calculations";

const TERMINAL_STAGES = new Set(["closed", "lost", "disqualified"]);

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
      assignedLoanOfficer: true,
    },
  });
}

function sortedHistory(deal: DealWithRelations) {
  return [...deal.stageHistory].sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
}

function inRange(date: Date, start: Date | null, end: Date): boolean {
  return (start === null || date >= start) && date <= end;
}

function num(v: string | number | null): number {
  return v === null ? 0 : Number(v);
}

function dealLeadValue(deal: DealWithRelations): number {
  return leadValueFor({
    loanAmountRequested: num(deal.loanAmountRequested),
    approvedLoanAmount: deal.approvedLoanAmount === null ? null : num(deal.approvedLoanAmount),
    originationPointsOverride: deal.originationPointsOverride === null ? null : num(deal.originationPointsOverride),
  }).amount;
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

/** First time this deal EVER entered `stage`, regardless of range — for cohort-style "did this lead eventually convert" questions where bounding the later event to the same window as the earlier one would undercount recent cohorts. */
function firstEntryEver(deal: DealWithRelations, stage: string): Date | null {
  const hist = sortedHistory(deal);
  const hit = hist.find((h) => h.stage === stage);
  return hit ? hit.changedAt : null;
}

function average(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}

// ---------------------------------------------------------------------------
// Pipeline & Conversion
// ---------------------------------------------------------------------------

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
 * actually happened next in each deal's own history.
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

export interface StageTransitionRow {
  label: string;
  fromStage: string;
  toStage: string;
  avgDays: number | null;
  count: number;
}

/** For each named A→B pair, the average days between a deal's first entry into A and its first entry into B — counted when the B-entry falls in the selected range (same "filter by when it landed" convention as everything else here). */
function buildStageTransitionTimes(dealsData: DealWithRelations[], start: Date | null, end: Date): StageTransitionRow[] {
  const pairs: { label: string; fromStage: string; toStage: string }[] = [
    { label: "New → Rate Shopping", fromStage: "new", toStage: "rate_shopping" },
    { label: "New → Term Sheet", fromStage: "new", toStage: "term_sheet" },
    { label: "New → Negotiation", fromStage: "new", toStage: "negotiation" },
    { label: "Rate Shopping → Term Sheet", fromStage: "rate_shopping", toStage: "term_sheet" },
  ];

  return pairs.map(({ label, fromStage, toStage }) => {
    const days: number[] = [];
    for (const deal of dealsData) {
      const toEntry = firstEntryInRange(deal, toStage, start, end);
      if (!toEntry) continue;
      const fromAt = firstEntryEver(deal, fromStage);
      if (!fromAt || fromAt.getTime() >= toEntry.changedAt.getTime()) continue;
      days.push(daysBetween(fromAt, toEntry.changedAt));
    }
    return { label, fromStage, toStage, avgDays: average(days), count: days.length };
  });
}

export interface SpeedRow {
  loanCategory: string;
  closedCount: number;
  averageDays: number;
}

function buildSpeedLeadToClose(dealsData: DealWithRelations[], start: Date | null, end: Date): SpeedRow[] {
  const byCategory = new Map<string, number[]>();
  for (const deal of dealsData) {
    const entry = firstEntryInRange(deal, "closed", start, end);
    if (!entry) continue;
    const days = daysBetween(deal.createdAt, entry.changedAt);
    const list = byCategory.get(deal.loanCategory) ?? [];
    list.push(days);
    byCategory.set(deal.loanCategory, list);
  }
  return [...byCategory.entries()]
    .map(([loanCategory, days]) => ({ loanCategory, closedCount: days.length, averageDays: average(days)! }))
    .sort((a, b) => b.closedCount - a.closedCount);
}

/** Item 9 of the request specifically: application → close, by loan type — distinct from lead → close above since a deal can sit in New/Rate Shopping/Negotiation a long time before an application is ever submitted. */
function buildSpeedApplicationToClose(dealsData: DealWithRelations[], start: Date | null, end: Date): SpeedRow[] {
  const byCategory = new Map<string, number[]>();
  for (const deal of dealsData) {
    const closedEntry = firstEntryInRange(deal, "closed", start, end);
    if (!closedEntry) continue;
    const appAt = firstEntryEver(deal, "application");
    if (!appAt || appAt.getTime() >= closedEntry.changedAt.getTime()) continue;
    const days = daysBetween(appAt, closedEntry.changedAt);
    const list = byCategory.get(deal.loanCategory) ?? [];
    list.push(days);
    byCategory.set(deal.loanCategory, list);
  }
  return [...byCategory.entries()]
    .map(([loanCategory, days]) => ({ loanCategory, closedCount: days.length, averageDays: average(days)! }))
    .sort((a, b) => b.closedCount - a.closedCount);
}

export interface PipelineConversionData {
  newLeads: number;
  applicationsSubmitted: number;
  leadToApplicationPct: number | null;
  leadLostPct: number | null;
  totalPipelineValue: number;
  totalLostValue: number;
  loansClosed: number;
  totalVolumeClosed: number;
  averageLoanSizeClosed: number;
  speedLeadToClose: SpeedRow[];
  speedApplicationToClose: SpeedRow[];
  funnel: FunnelRow[];
  stageTransitionTimes: StageTransitionRow[];
}

function buildPipelineConversion(dealsData: DealWithRelations[], start: Date | null, end: Date): PipelineConversionData {
  // Cohort: leads that entered "new" within the selected range.
  const leadCohort = dealsData.filter((d) => firstEntryInRange(d, "new", start, end) !== null);
  const newLeads = leadCohort.length;
  const convertedCount = leadCohort.filter((d) => firstEntryEver(d, "application") !== null).length;
  const lostCount = leadCohort.filter((d) => TERMINAL_STAGES.has(d.stage) && d.stage !== "closed").length;

  const applicationsSubmitted = dealsData.filter((d) => firstEntryInRange(d, "application", start, end) !== null).length;

  // Snapshot, not range-filtered — "what's live right now," same convention
  // Justin already sees on the pipeline board's Lead Value badges.
  const totalPipelineValue = dealsData
    .filter((d) => !TERMINAL_STAGES.has(d.stage))
    .reduce((sum, d) => sum + dealLeadValue(d), 0);

  const totalLostValue = dealsData
    .filter((d) => {
      const lostEntry = firstEntryInRange(d, "lost", start, end);
      const dqEntry = firstEntryInRange(d, "disqualified", start, end);
      return lostEntry !== null || dqEntry !== null;
    })
    .reduce((sum, d) => sum + dealLeadValue(d), 0);

  const closedAmounts = dealsData
    .filter((d) => firstEntryInRange(d, "closed", start, end) !== null)
    .map((d) => (d.approvedLoanAmount !== null ? num(d.approvedLoanAmount) : num(d.loanAmountRequested)));
  const totalVolumeClosed = closedAmounts.reduce((a, b) => a + b, 0);

  return {
    newLeads,
    applicationsSubmitted,
    leadToApplicationPct: newLeads ? (convertedCount / newLeads) * 100 : null,
    leadLostPct: newLeads ? (lostCount / newLeads) * 100 : null,
    totalPipelineValue,
    totalLostValue,
    loansClosed: closedAmounts.length,
    totalVolumeClosed,
    averageLoanSizeClosed: closedAmounts.length ? totalVolumeClosed / closedAmounts.length : 0,
    speedLeadToClose: buildSpeedLeadToClose(dealsData, start, end),
    speedApplicationToClose: buildSpeedApplicationToClose(dealsData, start, end),
    funnel: buildFunnel(dealsData, start, end),
    stageTransitionTimes: buildStageTransitionTimes(dealsData, start, end),
  };
}

// ---------------------------------------------------------------------------
// Loan Officer Performance
// ---------------------------------------------------------------------------

export interface LoanOfficerRow {
  userId: string;
  name: string;
  closedCount: number;
  closedVolume: number;
  revenue: number;
  leadCount: number;
  applicationCount: number;
  leadToApplicationPct: number | null;
  applicationToClosePct: number | null;
  averageDealSize: number;
}

function buildLoanOfficerPerformance(dealsData: DealWithRelations[], start: Date | null, end: Date): LoanOfficerRow[] {
  const byLo = new Map<string, LoanOfficerRow>();
  const getRow = (id: string, name: string) => {
    let row = byLo.get(id);
    if (!row) {
      row = {
        userId: id,
        name,
        closedCount: 0,
        closedVolume: 0,
        revenue: 0,
        leadCount: 0,
        applicationCount: 0,
        leadToApplicationPct: null,
        applicationToClosePct: null,
        averageDealSize: 0,
      };
      byLo.set(id, row);
    }
    return row;
  };

  for (const deal of dealsData) {
    if (!deal.assignedLoanOfficerId || !deal.assignedLoanOfficer) continue;
    const row = getRow(deal.assignedLoanOfficerId, deal.assignedLoanOfficer.name ?? deal.assignedLoanOfficer.email ?? "Unknown");

    if (firstEntryInRange(deal, "new", start, end)) row.leadCount++;
    if (firstEntryInRange(deal, "application", start, end)) row.applicationCount++;

    const closedEntry = firstEntryInRange(deal, "closed", start, end);
    if (closedEntry) {
      row.closedCount++;
      const amount = deal.approvedLoanAmount !== null ? num(deal.approvedLoanAmount) : num(deal.loanAmountRequested);
      row.closedVolume += amount;
      row.revenue += dealLeadValue(deal);
    }
  }

  for (const row of byLo.values()) {
    row.leadToApplicationPct = row.leadCount ? (row.applicationCount / row.leadCount) * 100 : null;
    row.applicationToClosePct = row.applicationCount ? (row.closedCount / row.applicationCount) * 100 : null;
    row.averageDealSize = row.closedCount ? row.closedVolume / row.closedCount : 0;
  }

  return [...byLo.values()].sort((a, b) => b.closedVolume - a.closedVolume);
}

// ---------------------------------------------------------------------------
// Loan Quality & Risk
// ---------------------------------------------------------------------------

export interface LoanQualityData {
  averageLtvAtClosing: number | null;
  averageDscrAtClosing: number | null;
  averageEstimatedFicoClosed: number | null;
  appraisalAccuracy: { sampleSize: number; pctBelowExpected: number | null; averagePctUnder: number | null };
}

function buildLoanQuality(dealsData: DealWithRelations[], start: Date | null, end: Date): LoanQualityData {
  const closedDeals = dealsData.filter((d) => firstEntryInRange(d, "closed", start, end) !== null);

  const ltvs = closedDeals.filter((d) => d.approvedLtv !== null).map((d) => num(d.approvedLtv));

  const dscrRatios: number[] = [];
  for (const deal of closedDeals) {
    if (!isDscrLikeCategory(deal.loanCategory)) continue;
    if (!deal.finalRate || !deal.finalLoanTermYears || !deal.approvedLoanAmount) continue;
    const pi = estimatedMonthlyPI(num(deal.approvedLoanAmount), num(deal.finalRate), deal.finalLoanTermYears);
    const pitia = estimatedMonthlyPitia(
      pi,
      deal.annualTaxes === null ? null : num(deal.annualTaxes),
      deal.annualInsurance === null ? null : num(deal.annualInsurance),
      deal.annualHoa === null ? null : num(deal.annualHoa)
    );
    const dscr = calculateDscrRatio(deal.currentRent === null ? null : num(deal.currentRent), pitia);
    if (dscr !== null) dscrRatios.push(dscr);
  }

  // No verified/underwritten FICO field exists yet — this is the FICO
  // collected at intake, an estimate the borrower self-reported, not a
  // pulled credit score. Labeled as such wherever it's shown.
  const ficos = closedDeals.filter((d) => d.estimatedFico !== null).map((d) => d.estimatedFico!);

  const appraised = closedDeals.filter((d) => d.appraisedValue !== null && (d.purchasePrice !== null || d.estimatedAsIsValue !== null));
  const pctUnders: number[] = [];
  for (const deal of appraised) {
    const expected = deal.purchasePrice !== null ? num(deal.purchasePrice) : num(deal.estimatedAsIsValue);
    const appraisedVal = num(deal.appraisedValue);
    if (expected > 0 && appraisedVal < expected) {
      pctUnders.push(((expected - appraisedVal) / expected) * 100);
    } else {
      pctUnders.push(0);
    }
  }
  const belowCount = pctUnders.filter((p) => p > 0).length;

  return {
    averageLtvAtClosing: average(ltvs),
    averageDscrAtClosing: average(dscrRatios),
    averageEstimatedFicoClosed: average(ficos),
    appraisalAccuracy: {
      sampleSize: appraised.length,
      pctBelowExpected: appraised.length ? (belowCount / appraised.length) * 100 : null,
      averagePctUnder: pctUnders.length ? average(pctUnders.filter((p) => p > 0)) : null,
    },
  };
}

// ---------------------------------------------------------------------------
// Lender Relationship Health
// ---------------------------------------------------------------------------

export interface LenderLossRow {
  lenderId: string;
  lenderName: string;
  reachedApplication: number;
  lostOrDisqualified: number;
}

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
  lost: number;
  averageDaysToClose: number | null;
}

function buildLenderPerformance(
  dealsData: DealWithRelations[],
  start: Date | null,
  end: Date,
  lenderNames: Map<string, string>
): LenderPerformanceRow[] {
  const byLender = new Map<string, LenderPerformanceRow>();
  const closeDays = new Map<string, number[]>();
  const getRow = (lenderId: string, lenderName: string) => {
    let row = byLender.get(lenderId);
    if (!row) {
      row = { lenderId, lenderName, priced: 0, chosen: 0, closed: 0, lost: 0, averageDaysToClose: null };
      byLender.set(lenderId, row);
    }
    return row;
  };

  for (const deal of dealsData) {
    const pricedLenderIds = new Set<string>();
    for (const req of deal.pricingRequests) {
      const at = req.sentAt ?? req.createdAt;
      if (inRange(at, start, end)) pricedLenderIds.add(req.lenderId);
    }
    for (const lenderId of pricedLenderIds) {
      getRow(lenderId, lenderNames.get(lenderId) ?? "Unknown lender").priced++;
    }

    const accepted = deal.termSheets.find((t) => t.status === "accepted" && t.acceptedAt);
    if (accepted && deal.lenderId && deal.lender && inRange(accepted.acceptedAt!, start, end)) {
      const row = getRow(deal.lenderId, deal.lender.name);
      row.chosen++;

      const closedEntry = firstEntryInRange(deal, "closed", start, end);
      if (closedEntry) {
        row.closed++;
        const days = closeDays.get(deal.lenderId) ?? [];
        days.push(daysBetween(accepted.acceptedAt!, closedEntry.changedAt));
        closeDays.set(deal.lenderId, days);
      } else if (deal.stage === "lost" || deal.stage === "disqualified") {
        row.lost++;
      }
    }
  }

  for (const row of byLender.values()) {
    row.averageDaysToClose = average(closeDays.get(row.lenderId) ?? []);
  }

  return [...byLender.values()].filter((r) => r.priced > 0 || r.chosen > 0).sort((a, b) => b.chosen - a.chosen);
}

export interface LenderTurnTimeRow {
  lenderId: string;
  lenderName: string;
  averageDaysToTermSheet: number | null;
  averageDaysToClearToClose: number | null;
}

/** Lender responsiveness, separate from our own internal timelines — time to term sheet is purely "how fast did this lender reply once priced," time to CTC is purely "how fast did this lender's underwriting move once the deal became theirs." */
function buildLenderTurnTimes(
  dealsData: DealWithRelations[],
  start: Date | null,
  end: Date,
  lenderNames: Map<string, string>
): LenderTurnTimeRow[] {
  const toTermSheet = new Map<string, number[]>();
  const toCtc = new Map<string, number[]>();

  for (const deal of dealsData) {
    for (const termSheet of deal.termSheets) {
      if (!inRange(termSheet.createdAt, start, end)) continue;
      const matchingRequest = deal.pricingRequests.find((r) => r.lenderId === termSheet.lenderId && r.sentAt);
      if (!matchingRequest?.sentAt) continue;
      const list = toTermSheet.get(termSheet.lenderId) ?? [];
      list.push(daysBetween(matchingRequest.sentAt, termSheet.createdAt));
      toTermSheet.set(termSheet.lenderId, list);
    }

    if (!deal.lenderId) continue;
    const ctcEntry = firstEntryInRange(deal, "clear_to_close", start, end);
    if (!ctcEntry) continue;
    const appAt = firstEntryEver(deal, "application");
    if (!appAt || appAt.getTime() >= ctcEntry.changedAt.getTime()) continue;
    const list = toCtc.get(deal.lenderId) ?? [];
    list.push(daysBetween(appAt, ctcEntry.changedAt));
    toCtc.set(deal.lenderId, list);
  }

  const lenderIds = new Set([...toTermSheet.keys(), ...toCtc.keys()]);
  return [...lenderIds]
    .map((lenderId) => ({
      lenderId,
      lenderName: lenderNames.get(lenderId) ?? "Unknown lender",
      averageDaysToTermSheet: average(toTermSheet.get(lenderId) ?? []),
      averageDaysToClearToClose: average(toCtc.get(lenderId) ?? []),
    }))
    .sort((a, b) => (a.lenderName < b.lenderName ? -1 : 1));
}

export interface WalletShareRow {
  lenderId: string;
  lenderName: string;
  volume: number;
  pct: number;
}

/** % of total closed volume going to each lender — a concentration-risk read, not a performance one. */
function buildWalletShare(dealsData: DealWithRelations[], start: Date | null, end: Date, lenderNames: Map<string, string>): WalletShareRow[] {
  const byLender = new Map<string, number>();
  let total = 0;
  for (const deal of dealsData) {
    const closedEntry = firstEntryInRange(deal, "closed", start, end);
    if (!closedEntry || !deal.lenderId) continue;
    const amount = deal.approvedLoanAmount !== null ? num(deal.approvedLoanAmount) : num(deal.loanAmountRequested);
    byLender.set(deal.lenderId, (byLender.get(deal.lenderId) ?? 0) + amount);
    total += amount;
  }
  return [...byLender.entries()]
    .map(([lenderId, volume]) => ({
      lenderId,
      lenderName: lenderNames.get(lenderId) ?? "Unknown lender",
      volume,
      pct: total ? (volume / total) * 100 : 0,
    }))
    .sort((a, b) => b.volume - a.volume);
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

// ---------------------------------------------------------------------------
// Cost & Profitability
// ---------------------------------------------------------------------------

export interface CostProfitabilityData {
  projectedRevenue: number;
  closedRevenue: number;
  avgOriginationPointsByLoanType: { loanCategory: string; averagePoints: number; count: number }[];
}

function buildCostProfitability(dealsData: DealWithRelations[], start: Date | null, end: Date): CostProfitabilityData {
  // Projected: every currently-open deal's lead value, as a forward-looking
  // "what's on the books" figure — mirrors totalPipelineValue above but
  // framed as revenue rather than pipeline size.
  const projectedRevenue = dealsData
    .filter((d) => !TERMINAL_STAGES.has(d.stage))
    .reduce((sum, d) => sum + dealLeadValue(d), 0);

  const closedRevenue = dealsData
    .filter((d) => firstEntryInRange(d, "closed", start, end) !== null)
    .reduce((sum, d) => sum + dealLeadValue(d), 0);

  const byCategory = new Map<string, number[]>();
  for (const deal of dealsData) {
    if (!firstEntryInRange(deal, "closed", start, end)) continue;
    if (deal.originationPointsOverride === null) continue;
    const list = byCategory.get(deal.loanCategory) ?? [];
    list.push(num(deal.originationPointsOverride));
    byCategory.set(deal.loanCategory, list);
  }
  const avgOriginationPointsByLoanType = [...byCategory.entries()]
    .map(([loanCategory, points]) => ({ loanCategory, averagePoints: average(points)!, count: points.length }))
    .sort((a, b) => b.count - a.count);

  return { projectedRevenue, closedRevenue, avgOriginationPointsByLoanType };
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export interface OperationsData {
  activeByStage: { stage: string; count: number }[];
  activeByLoanOfficer: { userId: string; name: string; count: number }[];
}

/** A right-now snapshot of the live pipeline's shape, not range-filtered — "what does the desk look like today," same convention as Total Pipeline Value. */
function buildOperations(dealsData: DealWithRelations[]): OperationsData {
  const activeDeals = dealsData.filter((d) => !TERMINAL_STAGES.has(d.stage) && d.stage !== "on_hold");

  const byStage = new Map<string, number>();
  for (const deal of activeDeals) {
    byStage.set(deal.stage, (byStage.get(deal.stage) ?? 0) + 1);
  }
  const activeByStage = dealStageEnum.enumValues
    .filter((s) => byStage.has(s))
    .map((stage) => ({ stage, count: byStage.get(stage)! }));

  const byLo = new Map<string, { name: string; count: number }>();
  for (const deal of activeDeals) {
    if (!deal.assignedLoanOfficerId || !deal.assignedLoanOfficer) continue;
    const entry = byLo.get(deal.assignedLoanOfficerId) ?? {
      name: deal.assignedLoanOfficer.name ?? deal.assignedLoanOfficer.email ?? "Unknown",
      count: 0,
    };
    entry.count++;
    byLo.set(deal.assignedLoanOfficerId, entry);
  }
  const activeByLoanOfficer = [...byLo.entries()]
    .map(([userId, { name, count }]) => ({ userId, name, count }))
    .sort((a, b) => b.count - a.count);

  return { activeByStage, activeByLoanOfficer };
}

// ---------------------------------------------------------------------------
// Forward Looking
// ---------------------------------------------------------------------------

export interface PipelineAgingRow {
  dealId: string;
  loanNumber: number | null;
  borrowerName: string;
  stage: string;
  daysInStage: number;
  expectedDays: number;
}

/**
 * Data-driven "expected" duration per stage: the historical average time
 * ALL deals (not just active ones) have spent in that stage before moving
 * on, computed from stageHistory — same philosophy as the funnel, an
 * observed baseline rather than a guessed threshold. A deal shows up here
 * once its current stage has run longer than that baseline.
 */
function buildPipelineAging(dealsData: DealWithRelations[]): PipelineAgingRow[] {
  const historicalDurations = new Map<string, number[]>();
  for (const deal of dealsData) {
    const hist = sortedHistory(deal);
    for (let i = 0; i < hist.length - 1; i++) {
      const stage = hist[i].stage;
      const durationDays = daysBetween(hist[i].changedAt, hist[i + 1].changedAt);
      const list = historicalDurations.get(stage) ?? [];
      list.push(durationDays);
      historicalDurations.set(stage, list);
    }
  }
  const expectedByStage = new Map<string, number>();
  for (const [stage, durations] of historicalDurations) {
    expectedByStage.set(stage, average(durations) ?? 0);
  }

  const now = new Date();
  const rows: PipelineAgingRow[] = [];
  for (const deal of dealsData) {
    if (TERMINAL_STAGES.has(deal.stage) || deal.stage === "on_hold") continue;
    const hist = sortedHistory(deal);
    const currentEntry = [...hist].reverse().find((h) => h.stage === deal.stage);
    if (!currentEntry) continue;
    const daysInStage = daysBetween(currentEntry.changedAt, now);
    const expectedDays = expectedByStage.get(deal.stage) ?? 0;
    if (expectedDays > 0 && daysInStage > expectedDays) {
      rows.push({
        dealId: deal.id,
        loanNumber: deal.loanNumber,
        borrowerName: deal.borrowerName,
        stage: deal.stage,
        daysInStage,
        expectedDays,
      });
    }
  }
  return rows.sort((a, b) => b.daysInStage - b.expectedDays - (a.daysInStage - a.expectedDays));
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export interface DashboardData {
  pipelineConversion: PipelineConversionData;
  loanOfficerPerformance: LoanOfficerRow[];
  loanQuality: LoanQualityData;
  lenderLoss: LenderLossRow[];
  lenderPerformance: LenderPerformanceRow[];
  lenderTurnTimes: LenderTurnTimeRow[];
  walletShare: WalletShareRow[];
  referralPerformance: ReferralPerformanceRow[];
  costProfitability: CostProfitabilityData;
  operations: OperationsData;
  pipelineAging: PipelineAgingRow[];
  enabledDashboardMetrics: string[];
}

export async function buildDashboardData(range: DashboardRange): Promise<DashboardData> {
  const start = dashboardRangeStart(range);
  const end = new Date();
  const [dealsData, allLenders, settingsRow] = await Promise.all([
    fetchDeals(),
    db.query.lenders.findMany(),
    db.query.companySettings.findFirst({ where: eq(companySettings.id, "default") }),
  ]);
  const lenderNames = new Map(allLenders.map((l) => [l.id, l.name]));

  return {
    pipelineConversion: buildPipelineConversion(dealsData, start, end),
    loanOfficerPerformance: buildLoanOfficerPerformance(dealsData, start, end),
    loanQuality: buildLoanQuality(dealsData, start, end),
    lenderLoss: buildLenderLoss(dealsData, start, end),
    lenderPerformance: buildLenderPerformance(dealsData, start, end, lenderNames),
    lenderTurnTimes: buildLenderTurnTimes(dealsData, start, end, lenderNames),
    walletShare: buildWalletShare(dealsData, start, end, lenderNames),
    referralPerformance: buildReferralPerformance(dealsData, start, end),
    costProfitability: buildCostProfitability(dealsData, start, end),
    operations: buildOperations(dealsData),
    pipelineAging: buildPipelineAging(dealsData),
    enabledDashboardMetrics: settingsRow?.enabledDashboardMetrics ?? [],
  };
}
