import type { ActivityRow, ConditionRow, DealRow, KeyDateRow, McpData, NeedDocumentRow, NeedRow, StageHistoryRow, TeamUser } from "../model";

export const NOW = new Date("2026-10-27T15:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
const daysFromNow = (d: number) => new Date(NOW.getTime() + d * 86_400_000);

export const TEAM: TeamUser[] = [
  { id: "u-justin", name: "Justin Barber", email: "justin@example.com" },
  { id: "u-pat", name: "Pat Processor", email: "pat@example.com" },
  { id: "u-sam", name: "Sam Assistant", email: "sam@example.com" },
];

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const A = uuid(1);
export const B = uuid(2);
export const C = uuid(3);
export const D = uuid(4);
export const E = uuid(5);

function deal(id: string, loanNumber: number, over: Partial<DealRow>): DealRow {
  return {
    id,
    loanNumber,
    borrowerName: `Borrower ${loanNumber}`,
    propertyAddress: `${loanNumber} Main St, Austin TX`,
    loanCategory: "dscr_purchase",
    stage: "underwriting_review",
    pausedFromStage: null,
    lenderName: "Kiavi",
    productName: "DSCR 30yr",
    loanOfficerId: "u-justin",
    processorId: "u-pat",
    assistantId: null,
    loanAmountRequested: "450000",
    approvedLoanAmount: null,
    estimatedClosingDate: null,
    creditPullDate: null,
    rateLockedAt: null,
    rateLockExpiresAt: null,
    clearToCloseDate: null,
    closedDate: null,
    referralPartnerName: null,
    referralPartnerType: null,
    lostReason: null,
    createdAt: hoursAgo(24 * 30),
    ...over,
  };
}

export const DEALS: DealRow[] = [
  deal(A, 1001, { borrowerName: "Acme Holdings", estimatedClosingDate: daysFromNow(6), referralPartnerName: "Riley Realty", referralPartnerType: "agent", rateLockedAt: hoursAgo(72) }),
  deal(B, 1002, { borrowerName: "Bella Flips", loanCategory: "fix_and_flip", stage: "clear_to_close", lenderName: "Lima One", productName: null, estimatedClosingDate: daysFromNow(3) }),
  deal(C, 1003, { borrowerName: "Carter Builds", loanCategory: "new_construction", stage: "application", processorId: "u-sam", loanOfficerId: "u-justin", lenderName: null }),
  deal(D, 1004, { borrowerName: "Done Deal", stage: "closed", estimatedClosingDate: daysFromNow(-5) }),
  deal(E, 1005, { borrowerName: "Paused Pete", stage: "on_hold", estimatedClosingDate: daysFromNow(2) }),
];

const need = (id: string, dealId: string, over: Partial<NeedRow>): NeedRow => ({
  id,
  dealId,
  itemName: "Item",
  description: null,
  status: "awaiting_docs",
  needType: "document_upload",
  onHoldAt: null,
  createdAt: hoursAgo(10),
  sentAt: null,
  acceptedAt: null,
  requestedByUserId: null,
  sentByUserId: null,
  responsibleParty: null,
  blocks: null,
  lastReminderAt: null,
  lastReminderKind: null,
  lastBorrowerActivityAt: null,
  ...over,
});

export const NEEDS: NeedRow[] = [
  need("n1", A, { itemName: "Title Commitment", description: "Send to Pat. Borrower SSN 123-45-6789 on the form.", createdAt: hoursAgo(80), sentAt: hoursAgo(79), sentByUserId: "u-pat", lastReminderAt: hoursAgo(20), lastReminderKind: "automatic" }),
  need("n2", A, { itemName: "Bank Statements", status: "review_needed", createdAt: hoursAgo(30), requestedByUserId: "u-pat", lastBorrowerActivityAt: hoursAgo(2) }),
  need("n3", B, { itemName: "Insurance Binder", createdAt: hoursAgo(100), responsibleParty: "insurance", blocks: "closing", lastReminderAt: hoursAgo(48), lastReminderKind: "manual" }),
  need("n4", B, { itemName: "Photo ID", status: "accepted", createdAt: hoursAgo(200), acceptedAt: hoursAgo(150) }),
  need("n5", C, { itemName: "Entity Docs - Operating Agreement", status: "not_sent", createdAt: hoursAgo(60) }),
  need("n6", A, { itemName: "Appraisal", onHoldAt: hoursAgo(5), createdAt: hoursAgo(200) }),
  need("n7", C, { itemName: "Lease Agreement", createdAt: hoursAgo(10) }),
  need("n8", D, { itemName: "Leftover item on a closed loan", createdAt: hoursAgo(500) }),
];

export const HISTORY: Record<string, StageHistoryRow[]> = {
  [A]: [
    { stage: "new", changedAt: hoursAgo(24 * 20), changedByName: "Justin Barber" },
    { stage: "application", changedAt: hoursAgo(24 * 10), changedByName: "Pat Processor" },
    { stage: "underwriting_review", changedAt: hoursAgo(24 * 2), changedByName: null },
  ],
};

export const CONDITIONS: Record<string, ConditionRow[]> = {
  [A]: [{ id: "c1", category: "title", description: "Updated title commitment showing no liens", status: "open", processorNote: null, createdAt: hoursAgo(40), clearedAt: null }],
};

export const KEY_DATES: Record<string, KeyDateRow[]> = {
  [A]: [
    { item: "appraisal", status: "ordered", eventDate: hoursAgo(100) },
    { item: "appraisal", status: "received", eventDate: hoursAgo(20) },
    { item: "title", status: "ordered", eventDate: hoursAgo(90) },
  ],
};

export const DOCS: Record<string, NeedDocumentRow[]> = {
  [A]: [{ needId: "n2", fileName: "Chase statement 4821 (acct 123456789012).pdf", reviewStatus: "pending", uploadedAt: hoursAgo(2), uploadedBy: "borrower_or_system", rejectionNote: null }],
};

export const LAST_ACTIVITY: Record<string, Date> = {
  [A]: hoursAgo(2),
  [B]: hoursAgo(24 * 5),
  [C]: hoursAgo(1),
  [E]: hoursAgo(24 * 9),
};

export const ACTIVITY: ActivityRow[] = [
  { type: "stage_change", occurredAt: hoursAgo(48), dealId: A, sourceId: "s1", actor: "system", summary: "Moved to Underwriting Review" },
  { type: "upload", occurredAt: hoursAgo(2), dealId: A, sourceId: "d1", actor: "borrower", summary: 'Uploaded "statement.pdf" to "Bank Statements"' },
  { type: "note", occurredAt: hoursAgo(5), dealId: B, sourceId: "nt1", actor: "Pat Processor", summary: "Called title, waiting on payoff." },
  { type: "need_added", occurredAt: hoursAgo(60), dealId: C, sourceId: "n5", actor: null, summary: "Client need added: Entity Docs - Operating Agreement" },
  { type: "email", occurredAt: hoursAgo(1), dealId: C, sourceId: "e1", actor: "Sam Assistant", summary: "Client needs update: Items needed" },
  { type: "need_cleared", occurredAt: hoursAgo(150), dealId: B, sourceId: "n4:accepted", actor: "Pat Processor", summary: "Client need accepted: Photo ID" },
];

/** In-memory McpData. `calls` records every method used, so tests can see what a tool touched. */
export function fakeData(over: { deals?: DealRow[]; needs?: NeedRow[] } = {}): McpData & { calls: string[] } {
  const deals = over.deals ?? DEALS;
  const needs = over.needs ?? NEEDS;
  const calls: string[] = [];
  const track = <T,>(name: string, value: T): Promise<T> => {
    calls.push(name);
    return Promise.resolve(value);
  };
  const live = (d: DealRow) => d.id !== "deleted";
  return {
    calls,
    listTeam: () => track("listTeam", TEAM),
    listDeals: ({ stages }) => track("listDeals", deals.filter((d) => live(d) && (!stages || stages.includes(d.stage)))),
    findDeal: ({ id, loanNumber }) => track("findDeal", deals.find((d) => (id ? d.id === id : d.loanNumber === loanNumber)) ?? null),
    stageCounts: () => {
      const counts: Record<string, number> = {};
      for (const d of deals) counts[d.stage] = (counts[d.stage] ?? 0) + 1;
      return track("stageCounts", counts);
    },
    lastActivity: (ids) => track("lastActivity", new Map(ids.filter((id) => LAST_ACTIVITY[id]).map((id) => [id, LAST_ACTIVITY[id]]))),
    stageHistory: (id) => track("stageHistory", HISTORY[id] ?? []),
    conditions: (id) => track("conditions", CONDITIONS[id] ?? []),
    keyDateEvents: (id) => track("keyDateEvents", KEY_DATES[id] ?? []),
    needs: ({ dealIds, outstandingOnly }) =>
      track("needs", needs.filter((n) => dealIds.includes(n.dealId) && (!outstandingOnly || (["not_sent", "awaiting_docs", "review_needed", "document_rejected_not_sent", "need_rejected_not_sent"].includes(n.status) && n.onHoldAt === null)))),
    needDocuments: (id) => track("needDocuments", DOCS[id] ?? []),
    recentActivity: ({ since, dealId, perSourceLimit }) =>
      track("recentActivity", ACTIVITY.filter((r) => r.occurredAt >= since && (!dealId || r.dealId === dealId)).slice(0, perSourceLimit * 6)),
  };
}
