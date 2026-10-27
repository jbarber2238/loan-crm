// The logic behind the five read-only tools. Every function takes an McpData
// (the only thing that touches the database, and only through a read-only
// transaction) and returns plain JSON-ready objects with ISO timestamps. There
// is deliberately no function here that creates, changes or sends anything.

import { LOAN_CATEGORIES, STAGES } from "@/lib/labels";
import { PIPELINE_STAGES } from "@/lib/deal-pipeline";
import { EMAIL_LOG_CATEGORY_LABELS } from "@/lib/email-log-categories";
import { safeText } from "./redact";
import { McpInputError, pageWindow, paginate, type Page } from "./pagination";
import type {
  ActivityRow,
  ConditionRow,
  DealRow,
  KeyDateRow,
  McpData,
  NeedDocumentRow,
  NeedRow,
  StageHistoryRow,
  TeamUser,
} from "./model";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Open = New through Clear to Close, the same definition the CRM's own pipeline totals use. */
export const OPEN_STAGE_VALUES: string[] = PIPELINE_STAGES.filter((s) => s.value !== "closed").map((s) => s.value);
export const ALL_STAGE_VALUES: string[] = STAGES.map((s) => s.value);

const STAGE_LABELS = new Map<string, string>([...STAGES.map((s) => [s.value, s.label] as const), ["processing", "Processing (legacy)"]]);
const CATEGORY_LABELS = new Map<string, string>(LOAN_CATEGORIES.map((c) => [c.value, c.label]));

export const STALE_LOAN_DAYS = 3;
export const AGED_NEED_HOURS = 48;
export const CLOSING_SOON_DAYS = 10;
export const MAX_ACTIVITY_LOOKBACK_DAYS = 90;
const SUMMARY_LIST_CAP = 50;
/** Most events one activity query will page through. */
export const MAX_ACTIVITY_WINDOW = 600;

export function stageLabel(stage: string): string {
  return STAGE_LABELS.get(stage) ?? stage;
}

/** "DSCR", "Fix and flip", "Ground up", "Bridge" or "Portfolio": the way the team talks about loan types. */
export function loanType(category: string): string {
  if (category.startsWith("dscr_")) return "DSCR";
  if (category === "fix_and_flip") return "Fix and flip";
  if (category === "new_construction") return "Ground up";
  if (category.startsWith("bridge_")) return "Bridge";
  if (category === "portfolio") return "Portfolio";
  return category;
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);
const hoursBetween = (from: Date, to: Date): number => Math.max(0, Math.floor((to.getTime() - from.getTime()) / HOUR_MS));

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

type UserMap = Map<string, TeamUser>;
const toUserMap = (team: TeamUser[]): UserMap => new Map(team.map((u) => [u.id, u]));
const nameOf = (users: UserMap, id: string | null): string | null => (id ? (users.get(id)?.name ?? users.get(id)?.email ?? null) : null);

/** Matches a team member by id, email, or part of their name. Throws with the team's names when nothing matches. */
export function resolveAssignee(team: TeamUser[], query: string): Set<string> {
  const q = query.trim().toLowerCase();
  if (!q) throw new McpInputError("assigned_to is empty.");
  const matches = team.filter(
    (u) => u.id.toLowerCase() === q || u.email?.toLowerCase() === q || u.name?.toLowerCase() === q
  );
  const found = matches.length ? matches : team.filter((u) => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
  if (!found.length) {
    const names = team.map((u) => u.name ?? u.email).filter(Boolean).join(", ");
    throw new McpInputError(`No team member matches "${query}". Team: ${names}.`);
  }
  return new Set(found.map((u) => u.id));
}

const assignedTo = (deal: DealRow, ids: Set<string>): boolean =>
  [deal.loanOfficerId, deal.processorId, deal.assistantId].some((id) => id !== null && ids.has(id));

// ---------------------------------------------------------------------------
// Loans
// ---------------------------------------------------------------------------

function loanHeader(deal: DealRow, users: UserMap) {
  return {
    loan_id: deal.id,
    loan_number: deal.loanNumber,
    borrower_name: deal.borrowerName,
    property_address: deal.propertyAddress,
    loan_type: loanType(deal.loanCategory),
    loan_category: CATEGORY_LABELS.get(deal.loanCategory) ?? deal.loanCategory,
    lender: deal.lenderName,
    stage: deal.stage,
    stage_label: stageLabel(deal.stage),
    target_close_date: iso(deal.estimatedClosingDate),
    loan_officer: nameOf(users, deal.loanOfficerId),
    processor: nameOf(users, deal.processorId),
  };
}

function loanBrief(deal: DealRow) {
  return {
    loan_id: deal.id,
    loan_number: deal.loanNumber,
    borrower_name: deal.borrowerName,
    property_address: deal.propertyAddress,
  };
}

export async function listOpenLoans(
  data: McpData,
  args: { stage?: string; assigned_to?: string; limit?: number; cursor?: string }
): Promise<Page<ReturnType<typeof loanHeader> & { last_activity_at: string | null }>> {
  if (args.stage !== undefined && !ALL_STAGE_VALUES.includes(args.stage)) {
    throw new McpInputError(`Unknown stage "${args.stage}". Stages: ${ALL_STAGE_VALUES.join(", ")}.`);
  }
  const team = await data.listTeam();
  const wanted = args.assigned_to ? resolveAssignee(team, args.assigned_to) : null;
  const deals = (await data.listDeals({ stages: args.stage ? [args.stage] : OPEN_STAGE_VALUES })).filter(
    (d) => !wanted || assignedTo(d, wanted)
  );
  deals.sort(byTargetCloseThenNumber);
  const page = paginate(deals, args.limit, args.cursor);
  const users = toUserMap(team);
  const activity = await data.lastActivity(page.items.map((d) => d.id));
  return {
    ...page,
    items: page.items.map((d) => ({ ...loanHeader(d, users), last_activity_at: iso(activity.get(d.id) ?? d.createdAt) })),
  };
}

function byTargetCloseThenNumber(a: DealRow, b: DealRow): number {
  const at = a.estimatedClosingDate?.getTime() ?? Number.POSITIVE_INFINITY;
  const bt = b.estimatedClosingDate?.getTime() ?? Number.POSITIVE_INFINITY;
  return at - bt || a.loanNumber - b.loanNumber;
}

/** Accepts the loan's uuid, its loan number ("1042"), or "#1042". */
async function requireDeal(data: McpData, loanId: string): Promise<DealRow> {
  const ref = loanId.trim().replace(/^#/, "");
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
  const isNumber = /^\d{1,9}$/.test(ref);
  if (!isUuid && !isNumber) throw new McpInputError(`loan_id "${loanId}" is not a loan id or loan number.`);
  const deal = await data.findDeal(isUuid ? { id: ref.toLowerCase() } : { loanNumber: Number(ref) });
  if (!deal) throw new McpInputError(`No loan found for "${loanId}".`);
  return deal;
}

function keyDates(deal: DealRow, events: KeyDateRow[]) {
  // The tracker's current status for an item is simply its most recent event.
  const latest = new Map<string, KeyDateRow>();
  for (const e of events) {
    const seen = latest.get(e.item);
    if (!seen || e.eventDate > seen.eventDate) latest.set(e.item, e);
  }
  const tracked = (item: string) => {
    const e = latest.get(item);
    return e ? { status: safeText(e.status, 80), date: iso(e.eventDate) } : null;
  };
  return {
    created_at: iso(deal.createdAt),
    credit_pull_date: iso(deal.creditPullDate),
    rate_locked_at: iso(deal.rateLockedAt),
    rate_lock_expires_at: iso(deal.rateLockExpiresAt),
    target_close_date: iso(deal.estimatedClosingDate),
    clear_to_close_date: iso(deal.clearToCloseDate),
    closed_date: iso(deal.closedDate),
    appraisal: tracked("appraisal"),
    insurance: tracked("insurance"),
    title: tracked("title"),
  };
}

function stageHistoryItems(rows: StageHistoryRow[], now: Date) {
  const sorted = [...rows].sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
  return sorted.map((r, i) => {
    const leftAt = sorted[i + 1]?.changedAt ?? now;
    return {
      stage: r.stage,
      stage_label: stageLabel(r.stage),
      entered_at: iso(r.changedAt),
      changed_by: r.changedByName,
      hours_in_stage: hoursBetween(r.changedAt, leftAt),
      current: i === sorted.length - 1,
    };
  });
}

function conditionItems(rows: ConditionRow[]) {
  return rows
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((c) => ({
      condition_id: c.id,
      category: c.category,
      description: safeText(c.description, 400),
      status: c.status,
      processor_note: safeText(c.processorNote, 300),
      created_at: iso(c.createdAt),
      cleared_at: iso(c.clearedAt),
    }));
}

export async function getLoan(data: McpData, args: { loan_id: string }, now: Date) {
  const deal = await requireDeal(data, args.loan_id);
  const [team, activity, history, conditions, events, needs, docs] = await Promise.all([
    data.listTeam(),
    data.lastActivity([deal.id]),
    data.stageHistory(deal.id),
    data.conditions(deal.id),
    data.keyDateEvents(deal.id),
    data.needs({ dealIds: [deal.id], outstandingOnly: false }),
    data.needDocuments(deal.id),
  ]);
  const users = toUserMap(team);
  const docsByNeed = new Map<string, NeedDocumentRow[]>();
  for (const d of docs) docsByNeed.set(d.needId, [...(docsByNeed.get(d.needId) ?? []), d]);

  const needItems = needs
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((n) => ({
      ...shapeNeed(n, deal, users, now),
      documents: (docsByNeed.get(n.id) ?? []).map((d) => ({
        file_name: safeText(d.fileName, 200),
        review_status: d.reviewStatus,
        uploaded_at: iso(d.uploadedAt),
        uploaded_by: d.uploadedBy,
        rejection_note: safeText(d.rejectionNote, 300),
      })),
    }));

  return {
    ...loanHeader(deal, users),
    last_activity_at: iso(activity.get(deal.id) ?? deal.createdAt),
    loan_amount_requested: deal.loanAmountRequested,
    approved_loan_amount: deal.approvedLoanAmount,
    product: deal.productName,
    paused_from_stage: deal.pausedFromStage,
    lost_reason: safeText(deal.lostReason, 300),
    assigned_team: {
      loan_officer: nameOf(users, deal.loanOfficerId),
      processor: nameOf(users, deal.processorId),
      loan_officer_assistant: nameOf(users, deal.assistantId),
    },
    referral_partner: deal.referralPartnerName
      ? { name: deal.referralPartnerName, type: deal.referralPartnerType }
      : null,
    key_dates: keyDates(deal, events),
    stage_history: stageHistoryItems(history, now),
    conditions: conditionItems(conditions),
    client_needs: needItems,
    client_needs_summary: {
      total: needItems.length,
      outstanding: needItems.filter((n) => n.outstanding).length,
      accepted: needItems.filter((n) => n.status === "accepted").length,
    },
  };
}

// ---------------------------------------------------------------------------
// Client needs
// ---------------------------------------------------------------------------

const OUTSTANDING_STATUSES = new Set(["not_sent", "awaiting_docs", "review_needed", "document_rejected_not_sent", "need_rejected_not_sent"]);

export function isOutstanding(need: Pick<NeedRow, "status" | "onHoldAt">): boolean {
  return OUTSTANDING_STATUSES.has(need.status) && need.onHoldAt === null;
}

const PARTIES = ["borrower", "processor", "title", "insurance", "lender"] as const;
type Party = (typeof PARTIES)[number];
const isParty = (v: string | null): v is Party => v !== null && (PARTIES as readonly string[]).includes(v);

const TITLE_RE = /\b(title|escrow|settlement|closing protection)\b/i;
const INSURANCE_RE = /\b(insurance|hazard|flood|binder|policy|coverage|dec(laration)?s?\s*page)\b/i;
const LENDER_RE = /\b(lender|underwrit\w*|investor)\b/i;

/**
 * Who the item is waiting on right now. A document sitting in review, or a
 * rejection nobody has told the borrower about yet, is the processor's move
 * whatever the item is. For an item still out with someone else it is the
 * recorded responsible party, or a guess from the item's name when none was
 * recorded (`inferred: true`).
 */
export function ownerOf(need: Pick<NeedRow, "status" | "itemName" | "responsibleParty">): { owed_by: Party; inferred: boolean; reason: string } {
  switch (need.status) {
    case "review_needed":
      return { owed_by: "processor", inferred: false, reason: "a document is uploaded and waiting for review" };
    case "document_rejected_not_sent":
    case "need_rejected_not_sent":
      return { owed_by: "processor", inferred: false, reason: "a rejection has not been sent back to the borrower yet" };
    case "not_sent":
      return { owed_by: "processor", inferred: false, reason: "the request has not been sent yet" };
    default:
      break;
  }
  if (isParty(need.responsibleParty)) return { owed_by: need.responsibleParty, inferred: false, reason: "recorded responsible party" };
  if (TITLE_RE.test(need.itemName)) return { owed_by: "title", inferred: true, reason: "guessed from the item name" };
  if (INSURANCE_RE.test(need.itemName)) return { owed_by: "insurance", inferred: true, reason: "guessed from the item name" };
  if (LENDER_RE.test(need.itemName)) return { owed_by: "lender", inferred: true, reason: "guessed from the item name" };
  return { owed_by: "borrower", inferred: true, reason: "default: the borrower provides it" };
}

const PRE_APPROVAL_STAGES = new Set(["new", "rate_shopping", "term_sheet", "negotiation", "application", "initial_app_review", "underwriting_review"]);
const CLOSING_ITEM_RE = /\b(title|insurance|escrow|closing|wire|payoff|settlement|binder|flood|hazard|disclosure)\b/i;

/** What the item holds up: the recorded value, or a guess from the item's name and the loan's stage. */
export function blocksOf(need: Pick<NeedRow, "blocks" | "itemName">, stage: string): { blocks: "underwriting" | "closing" | "none"; inferred: boolean } {
  if (need.blocks === "underwriting" || need.blocks === "closing" || need.blocks === "none") return { blocks: need.blocks, inferred: false };
  if (CLOSING_ITEM_RE.test(need.itemName)) return { blocks: "closing", inferred: true };
  return { blocks: PRE_APPROVAL_STAGES.has(stage) ? "underwriting" : "closing", inferred: true };
}

function shapeNeed(need: NeedRow, deal: DealRow, users: UserMap, now: Date) {
  const owner = ownerOf(need);
  const blocks = blocksOf(need, deal.stage);
  const recorded = nameOf(users, need.requestedByUserId);
  const sender = nameOf(users, need.sentByUserId);
  return {
    need_id: need.id,
    ...loanBrief(deal),
    stage: deal.stage,
    item: need.itemName,
    details: safeText(need.description, 300),
    need_type: need.needType,
    status: need.status,
    outstanding: isOutstanding(need),
    on_hold: need.onHoldAt !== null,
    requested_by: recorded ?? sender,
    requested_by_source: recorded ? "recorded" : sender ? "inferred_from_first_sender" : "unknown",
    owed_by: owner.owed_by,
    owed_by_inferred: owner.inferred,
    owed_by_reason: owner.reason,
    requested_at: iso(need.createdAt),
    first_sent_to_borrower_at: iso(need.sentAt),
    last_reminder_sent_at: iso(need.lastReminderAt),
    last_reminder_kind: need.lastReminderKind,
    last_borrower_activity_at: iso(need.lastBorrowerActivityAt),
    blocks: blocks.blocks,
    blocks_inferred: blocks.inferred,
    age_hours: hoursBetween(need.createdAt, now),
  };
}

export type NeedItem = ReturnType<typeof shapeNeed>;

/** Outstanding needs across open loans (or one loan, whatever its stage), oldest first. */
async function collectOutstandingNeeds(
  data: McpData,
  opts: { loanId?: string; assignedTo?: string; olderThanHours?: number },
  now: Date
): Promise<NeedItem[]> {
  const team = await data.listTeam();
  const users = toUserMap(team);
  let deals: DealRow[];
  if (opts.loanId) deals = [await requireDeal(data, opts.loanId)];
  else deals = await data.listDeals({ stages: OPEN_STAGE_VALUES });
  if (opts.assignedTo) {
    const wanted = resolveAssignee(team, opts.assignedTo);
    deals = deals.filter((d) => assignedTo(d, wanted));
  }
  if (!deals.length) return [];
  const byDeal = new Map(deals.map((d) => [d.id, d]));
  const needs = await data.needs({ dealIds: deals.map((d) => d.id), outstandingOnly: true });
  return needs
    .filter((n) => isOutstanding(n) && byDeal.has(n.dealId))
    .map((n) => shapeNeed(n, byDeal.get(n.dealId)!, users, now))
    .filter((n) => opts.olderThanHours === undefined || n.age_hours >= opts.olderThanHours)
    .sort((a, b) => b.age_hours - a.age_hours || a.loan_number - b.loan_number);
}

export async function listOutstandingNeeds(
  data: McpData,
  args: { loan_id?: string; older_than_hours?: number; assigned_to?: string; limit?: number; cursor?: string },
  now: Date
): Promise<Page<NeedItem>> {
  const all = await collectOutstandingNeeds(data, { loanId: args.loan_id, assignedTo: args.assigned_to, olderThanHours: args.older_than_hours }, now);
  return paginate(all, args.limit, args.cursor);
}

// ---------------------------------------------------------------------------
// Recent activity
// ---------------------------------------------------------------------------

export function parseSince(since: string, now: Date): { since: Date; clamped: boolean } {
  const parsed = new Date(since);
  if (Number.isNaN(parsed.getTime())) throw new McpInputError(`since "${since}" is not a date. Use an ISO timestamp like 2026-10-26T00:00:00Z.`);
  const earliest = new Date(now.getTime() - MAX_ACTIVITY_LOOKBACK_DAYS * DAY_MS);
  if (parsed > now) throw new McpInputError("since is in the future.");
  return parsed < earliest ? { since: earliest, clamped: true } : { since: parsed, clamped: false };
}

export async function listRecentActivity(
  data: McpData,
  args: { since: string; loan_id?: string; limit?: number; cursor?: string },
  now: Date
) {
  const { since, clamped } = parseSince(args.since, now);
  const deal = args.loan_id ? await requireDeal(data, args.loan_id) : null;
  // Enough from each source to fill the requested page and detect a next one.
  const { offset, size } = pageWindow(args.limit, args.cursor);
  if (offset + size > MAX_ACTIVITY_WINDOW) {
    throw new McpInputError(`That is further back than ${MAX_ACTIVITY_WINDOW} events. Use a more recent "since" instead of paging further.`);
  }
  const rows = await data.recentActivity({ since, dealId: deal?.id, perSourceLimit: offset + size + 1 });
  rows.sort(newestFirst);
  const deals = new Map<string, DealRow>();
  if (deal) deals.set(deal.id, deal);
  else for (const d of await data.listDeals({})) deals.set(d.id, d);
  const visible = rows.filter((r) => deals.has(r.dealId));
  const result = paginate(visible, args.limit, args.cursor);
  return {
    since: since.toISOString(),
    since_clamped_to_90_days: clamped,
    ...result,
    items: result.items.map((r) => {
      const d = deals.get(r.dealId);
      return {
        type: r.type,
        occurred_at: iso(r.occurredAt),
        loan_id: r.dealId,
        loan_number: d?.loanNumber ?? null,
        borrower_name: d?.borrowerName ?? null,
        actor: r.actor,
        summary: r.summary,
      };
    }),
  };
}

function newestFirst(a: ActivityRow, b: ActivityRow): number {
  return b.occurredAt.getTime() - a.occurredAt.getTime() || b.sourceId.localeCompare(a.sourceId);
}

export function emailLabel(category: string): string {
  return EMAIL_LOG_CATEGORY_LABELS[category] ?? category.replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// Pipeline summary
// ---------------------------------------------------------------------------

export async function pipelineSummary(data: McpData, now: Date) {
  const [team, counts, openDeals] = await Promise.all([data.listTeam(), data.stageCounts(), data.listDeals({ stages: OPEN_STAGE_VALUES })]);
  const users = toUserMap(team);
  const activity = await data.lastActivity(openDeals.map((d) => d.id));

  const staleCutoff = now.getTime() - STALE_LOAN_DAYS * DAY_MS;
  const stale = openDeals
    .map((d) => ({ deal: d, last: activity.get(d.id) ?? d.createdAt }))
    .filter((x) => x.last.getTime() < staleCutoff)
    .sort((a, b) => a.last.getTime() - b.last.getTime());

  const needs = await collectOutstandingNeeds(data, { olderThanHours: AGED_NEED_HOURS }, now);
  const byOwner = new Map<Party, NeedItem[]>();
  for (const n of needs) byOwner.set(n.owed_by, [...(byOwner.get(n.owed_by) ?? []), n]);

  const horizon = now.getTime() + CLOSING_SOON_DAYS * DAY_MS;
  const closingSoon = openDeals
    .filter((d) => d.estimatedClosingDate && d.estimatedClosingDate.getTime() >= startOfDay(now) && d.estimatedClosingDate.getTime() <= horizon)
    .sort(byTargetCloseThenNumber);

  const stageOrder = [...ALL_STAGE_VALUES, ...Object.keys(counts).filter((s) => !ALL_STAGE_VALUES.includes(s))];
  return {
    as_of: now.toISOString(),
    open_loans: openDeals.length,
    counts_by_stage: stageOrder
      .filter((s) => (counts[s] ?? 0) > 0 || OPEN_STAGE_VALUES.includes(s))
      .map((s) => ({ stage: s, stage_label: stageLabel(s), open: OPEN_STAGE_VALUES.includes(s), count: counts[s] ?? 0 })),
    no_activity_3_plus_days: {
      threshold_days: STALE_LOAN_DAYS,
      total: stale.length,
      loans: stale.slice(0, SUMMARY_LIST_CAP).map(({ deal, last }) => ({
        ...loanBrief(deal),
        stage: deal.stage,
        stage_label: stageLabel(deal.stage),
        loan_officer: nameOf(users, deal.loanOfficerId),
        processor: nameOf(users, deal.processorId),
        last_activity_at: iso(last),
        days_since_activity: Math.floor((now.getTime() - last.getTime()) / DAY_MS),
      })),
    },
    needs_older_than_48_hours: {
      threshold_hours: AGED_NEED_HOURS,
      total: needs.length,
      by_owner: PARTIES.filter((p) => byOwner.has(p)).map((p) => {
        const list = byOwner.get(p)!;
        return {
          owed_by: p,
          count: list.length,
          oldest_age_hours: list[0].age_hours,
          needs: list.slice(0, 10).map((n) => ({
            need_id: n.need_id,
            loan_id: n.loan_id,
            loan_number: n.loan_number,
            borrower_name: n.borrower_name,
            item: n.item,
            status: n.status,
            age_hours: n.age_hours,
            blocks: n.blocks,
          })),
        };
      }),
    },
    closing_in_next_10_days: {
      window_days: CLOSING_SOON_DAYS,
      total: closingSoon.length,
      loans: closingSoon.slice(0, SUMMARY_LIST_CAP).map((d) => ({
        ...loanBrief(d),
        stage: d.stage,
        stage_label: stageLabel(d.stage),
        target_close_date: iso(d.estimatedClosingDate),
        loan_officer: nameOf(users, d.loanOfficerId),
        processor: nameOf(users, d.processorId),
        last_activity_at: iso(activity.get(d.id) ?? d.createdAt),
      })),
    },
  };
}

const startOfDay = (d: Date): number => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

