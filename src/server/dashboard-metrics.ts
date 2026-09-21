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

const RESTORE_STAGES = new Set(["new", "rate_shopping"]);

/**
 * A "restore" is a deal re-entering New or Rate Shopping after it already
 * had history — i.e. it's not this deal's original submission, it came back
 * (from Lost, Follow-up, or an Archive/Delete restore). A deal's very first
 * history row is always its real creation into "new" (index 0), so any
 * later entry into New/Rate Shopping is by definition a return, not a new
 * lead — this is what separates "New Leads" from "Restored Leads" below.
 */
function restoreEntriesInRange(deal: DealWithRelations, start: Date | null, end: Date) {
  const hist = sortedHistory(deal);
  return hist.filter((h, i) => i > 0 && RESTORE_STAGES.has(h.stage) && inRange(h.changedAt, start, end));
}

/** Whether this deal had already been restored at least once before `before` — used to split "Applications Submitted" into straight-through vs. restored-then-applied. */
function hasRestoreEventBefore(deal: DealWithRelations, before: Date): boolean {
  const hist = sortedHistory(deal);
  return hist.some((h, i) => i > 0 && RESTORE_STAGES.has(h.stage) && h.changedAt.getTime() < before.getTime());
}

function average(nums: number[]): number | null {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}

/** Every stat card that's a count of deals carries the actual deals behind it, in this shape — lets the dashboard show "here's exactly what's being counted" on click instead of asking you to trust a number. */
export interface DrillDownDeal {
  id: string;
  loanNumber: number | null;
  borrowerName: string;
  propertyAddress: string;
  stage: string;
}

function toDrillDownDeal(d: DealWithRelations): DrillDownDeal {
  return { id: d.id, loanNumber: d.loanNumber, borrowerName: d.borrowerName, propertyAddress: d.propertyAddress, stage: d.stage };
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
  newLeadsDeals: DrillDownDeal[];
  restoredLeads: number;
  restoredLeadsDeals: DrillDownDeal[];
  applicationsSubmitted: number;
  applicationsSubmittedDirect: number;
  applicationsSubmittedRestored: number;
  applicationsSubmittedDeals: (DrillDownDeal & { viaRestore: boolean })[];
  leadToApplicationPct: number | null;
  leadToApplicationConvertedDeals: DrillDownDeal[];
  leadCohortDeals: DrillDownDeal[];
  leadLostPct: number | null;
  leadLostDeals: DrillDownDeal[];
  totalPipelineValue: number;
  totalPipelineValueDeals: DrillDownDeal[];
  totalLostValue: number;
  totalLostValueDeals: DrillDownDeal[];
  loansClosed: number;
  closedDeals: DrillDownDeal[];
  totalVolumeClosed: number;
  averageLoanSizeRequested: number;
  averageLoanSizeClosed: number;
  speedLeadToClose: SpeedRow[];
  speedApplicationToClose: SpeedRow[];
  funnel: FunnelRow[];
  stageTransitionTimes: StageTransitionRow[];
}

function buildPipelineConversion(dealsData: DealWithRelations[], start: Date | null, end: Date): PipelineConversionData {
  // A New Lead is a deal's actual, original submission — its very first
  // stage-history row is always its creation into "new", so this is the
  // same instant as deal.createdAt. Deliberately NOT firstEntryInRange
  // here: a deal restored back into "new" today would otherwise show up as
  // a brand-new lead today even though it's been in the system for months.
  const leadCohort = dealsData.filter((d) => inRange(d.createdAt, start, end));
  const newLeads = leadCohort.length;
  const convertedDeals = leadCohort.filter((d) => firstEntryEver(d, "application") !== null);
  const lostDeals = leadCohort.filter((d) => TERMINAL_STAGES.has(d.stage) && d.stage !== "closed");

  // A Restored Lead is the opposite case: an OLD deal re-entering New or
  // Rate Shopping this period (came back from Lost/Follow-up, or an
  // archive/delete restore) — counted once per deal even if it happened
  // more than once in the window.
  const restoredLeadsList = dealsData.filter((d) => restoreEntriesInRange(d, start, end).length > 0);

  const applicationEntriesInRange = dealsData
    .map((d) => ({ deal: d, entry: firstEntryInRange(d, "application", start, end) }))
    .filter((x): x is { deal: DealWithRelations; entry: { index: number; changedAt: Date } } => x.entry !== null);
  const applicationsSubmitted = applicationEntriesInRange.length;
  const applicationDealsWithFlag = applicationEntriesInRange.map(({ deal, entry }) => ({
    ...toDrillDownDeal(deal),
    viaRestore: hasRestoreEventBefore(deal, entry.changedAt),
  }));
  const applicationsSubmittedRestored = applicationDealsWithFlag.filter((d) => d.viaRestore).length;
  const applicationsSubmittedDirect = applicationsSubmitted - applicationsSubmittedRestored;

  // Snapshot, not range-filtered — "what's live right now," same convention
  // Justin already sees on the pipeline board's Lead Value badges. Matches
  // his own definition: everything between New and Clear to Close, plus
  // On Hold and Follow-up — i.e. everything that isn't Closed/Lost/Disqualified.
  const activeDeals = dealsData.filter((d) => !TERMINAL_STAGES.has(d.stage));
  const totalPipelineValue = activeDeals.reduce((sum, d) => sum + dealLeadValue(d), 0);

  // Real-time by design: only deals CURRENTLY sitting in Lost, that also
  // moved into Lost at some point in this range. A deal lost earlier this
  // month and then restored drops out of this number immediately — it's
  // never "banked" as a historical loss the way a static tally would.
  const lostNowDeals = dealsData.filter((d) => d.stage === "lost" && firstEntryInRange(d, "lost", start, end) !== null);
  const totalLostValue = lostNowDeals.reduce((sum, d) => sum + dealLeadValue(d), 0);

  const closedDeals = dealsData.filter((d) => firstEntryInRange(d, "closed", start, end) !== null);
  const closedAmounts = closedDeals.map((d) => (d.approvedLoanAmount !== null ? num(d.approvedLoanAmount) : num(d.loanAmountRequested)));
  const totalVolumeClosed = closedAmounts.reduce((a, b) => a + b, 0);

  const requestedAmounts = leadCohort.map((d) => num(d.loanAmountRequested));

  return {
    newLeads,
    newLeadsDeals: leadCohort.map(toDrillDownDeal),
    restoredLeads: restoredLeadsList.length,
    restoredLeadsDeals: restoredLeadsList.map(toDrillDownDeal),
    applicationsSubmitted,
    applicationsSubmittedDirect,
    applicationsSubmittedRestored,
    applicationsSubmittedDeals: applicationDealsWithFlag,
    leadToApplicationPct: newLeads ? (convertedDeals.length / newLeads) * 100 : null,
    leadToApplicationConvertedDeals: convertedDeals.map(toDrillDownDeal),
    leadCohortDeals: leadCohort.map(toDrillDownDeal),
    leadLostPct: newLeads ? (lostDeals.length / newLeads) * 100 : null,
    leadLostDeals: lostDeals.map(toDrillDownDeal),
    totalPipelineValue,
    totalPipelineValueDeals: activeDeals.map(toDrillDownDeal),
    totalLostValue,
    totalLostValueDeals: lostNowDeals.map(toDrillDownDeal),
    loansClosed: closedAmounts.length,
    closedDeals: closedDeals.map(toDrillDownDeal),
    totalVolumeClosed,
    averageLoanSizeRequested: requestedAmounts.length ? average(requestedAmounts)! : 0,
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

/**
 * Same cohort methodology as the top-line Pipeline & Conversion numbers —
 * NOT two independent range-counts divided by each other (that can exceed
 * 100% if an LO's applications this period came from leads submitted last
 * period). Lead→App is "of this LO's leads this period, how many have
 * since reached Application (ever)." App→Close is its own cohort: "of this
 * LO's applications this period, how many have since closed (ever)."
 */
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

  const leadCohortByLo = new Map<string, DealWithRelations[]>();
  const appCohortByLo = new Map<string, DealWithRelations[]>();

  for (const deal of dealsData) {
    if (!deal.assignedLoanOfficerId || !deal.assignedLoanOfficer) continue;
    const row = getRow(deal.assignedLoanOfficerId, deal.assignedLoanOfficer.name ?? deal.assignedLoanOfficer.email ?? "Unknown");

    if (inRange(deal.createdAt, start, end)) {
      const list = leadCohortByLo.get(deal.assignedLoanOfficerId) ?? [];
      list.push(deal);
      leadCohortByLo.set(deal.assignedLoanOfficerId, list);
    }
    if (firstEntryInRange(deal, "application", start, end)) {
      const list = appCohortByLo.get(deal.assignedLoanOfficerId) ?? [];
      list.push(deal);
      appCohortByLo.set(deal.assignedLoanOfficerId, list);
    }

    const closedEntry = firstEntryInRange(deal, "closed", start, end);
    if (closedEntry) {
      row.closedCount++;
      const amount = deal.approvedLoanAmount !== null ? num(deal.approvedLoanAmount) : num(deal.loanAmountRequested);
      row.closedVolume += amount;
      row.revenue += dealLeadValue(deal);
    }
  }

  for (const row of byLo.values()) {
    const leadCohort = leadCohortByLo.get(row.userId) ?? [];
    const appCohort = appCohortByLo.get(row.userId) ?? [];
    row.leadCount = leadCohort.length;
    row.applicationCount = appCohort.length;
    row.leadToApplicationPct = leadCohort.length
      ? (leadCohort.filter((d) => firstEntryEver(d, "application") !== null).length / leadCohort.length) * 100
      : null;
    row.applicationToClosePct = appCohort.length
      ? (appCohort.filter((d) => firstEntryEver(d, "closed") !== null).length / appCohort.length) * 100
      : null;
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
      } else {
        // Same real-time + "happened in this range" gating as Closed above
        // and as Total Lost Value: must be CURRENTLY lost, and must have
        // become lost during this range — a deal lost then restored drops
        // out immediately rather than staying counted against the lender.
        const lostInRange =
          firstEntryInRange(deal, "lost", start, end) !== null ||
          firstEntryInRange(deal, "disqualified", start, end) !== null;
        if (lostInRange && (deal.stage === "lost" || deal.stage === "disqualified")) {
          row.lost++;
        }
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
  averageDaysToClose: number | null;
}

/**
 * Lender responsiveness, separate from our own internal timelines. Since
 * there's no lender-reply webhook/timestamp to measure against, both of
 * these are anchored to OUR team's own button clicks — an approximation of
 * lender speed, not a precise one, but directionally useful:
 * - Time to Term Sheet: from clicking "Price Loan" (pricingRequest.createdAt
 *   — the request row is created the instant that dialog is submitted) to
 *   the term sheet draft actually existing in the system (termSheet.createdAt).
 * - Time to Close: from the deal entering Application (the moment the
 *   processing invoice is paid and the file effectively goes to this
 *   lender) to Closed. Same underlying duration as "Speed to Close:
 *   application → close" above, just sliced by lender instead of loan
 *   category — a deliberately different measure than the internal
 *   Application → Close speed metric's OWN slicing, not a duplicate: this
 *   view answers "which lender is slow," that one answers "which loan type
 *   is slow."
 */
function buildLenderTurnTimes(
  dealsData: DealWithRelations[],
  start: Date | null,
  end: Date,
  lenderNames: Map<string, string>
): LenderTurnTimeRow[] {
  const toTermSheet = new Map<string, number[]>();
  const toClose = new Map<string, number[]>();

  for (const deal of dealsData) {
    for (const termSheet of deal.termSheets) {
      if (!inRange(termSheet.createdAt, start, end)) continue;
      const matchingRequest = deal.pricingRequests.find((r) => r.lenderId === termSheet.lenderId);
      if (!matchingRequest) continue;
      const list = toTermSheet.get(termSheet.lenderId) ?? [];
      list.push(daysBetween(matchingRequest.createdAt, termSheet.createdAt));
      toTermSheet.set(termSheet.lenderId, list);
    }

    if (!deal.lenderId) continue;
    const closedEntry = firstEntryInRange(deal, "closed", start, end);
    if (!closedEntry) continue;
    const appAt = firstEntryEver(deal, "application");
    if (!appAt || appAt.getTime() >= closedEntry.changedAt.getTime()) continue;
    const list = toClose.get(deal.lenderId) ?? [];
    list.push(daysBetween(appAt, closedEntry.changedAt));
    toClose.set(deal.lenderId, list);
  }

  const lenderIds = new Set([...toTermSheet.keys(), ...toClose.keys()]);
  return [...lenderIds]
    .map((lenderId) => ({
      lenderId,
      lenderName: lenderNames.get(lenderId) ?? "Unknown lender",
      averageDaysToTermSheet: average(toTermSheet.get(lenderId) ?? []),
      averageDaysToClose: average(toClose.get(lenderId) ?? []),
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
  // Projected Revenue is deliberately NOT the same figure as Total Pipeline
  // Value: it's revenue expected to land IN the selected period, based on
  // each open deal's own estimatedClosingDate — "what do we expect to
  // actually book this month," not "what's open right now regardless of
  // when it's expected to close." Deals with no estimated closing date yet
  // can't be projected into a period, so they're excluded here (they still
  // count in Total Pipeline Value).
  const projectedRevenue = dealsData
    .filter((d) => !TERMINAL_STAGES.has(d.stage) && d.estimatedClosingDate && inRange(d.estimatedClosingDate, start, end))
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

// Every stage a deal can be actively sitting in — matches Justin's own
// definition of "pipeline" for Total Pipeline Value: everything from New
// through Clear to Close, plus On Hold and Follow-up. Fixed order (not
// derived from whatever's present) so the bar chart's shape and stage
// order stay stable even when a stage currently has zero deals in it.
export const ACTIVE_STAGE_ORDER = [
  "new",
  "rate_shopping",
  "term_sheet",
  "negotiation",
  "application",
  "processing",
  "conditional_approval",
  "clear_to_close",
  "on_hold",
  "follow_up",
] as const;

export interface OperationsData {
  activeByStage: { stage: string; count: number }[];
  activeByLoanOfficer: { userId: string; name: string; count: number }[];
}

/** A right-now snapshot of the live pipeline's shape, not range-filtered — "what does the desk look like today," same convention as Total Pipeline Value. Real-time by construction: this is a fresh DB read on every dashboard load, so a deal restored a moment ago already shows up in its new stage. */
function buildOperations(dealsData: DealWithRelations[]): OperationsData {
  const activeDeals = dealsData.filter((d) => !TERMINAL_STAGES.has(d.stage));

  const byStage = new Map<string, number>();
  for (const deal of activeDeals) {
    byStage.set(deal.stage, (byStage.get(deal.stage) ?? 0) + 1);
  }
  const activeByStage = ACTIVE_STAGE_ORDER.map((stage) => ({ stage, count: byStage.get(stage) ?? 0 }));

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
