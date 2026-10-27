// Shapes shared by the data layer (data.ts) and the tool logic (operations.ts).
// Rows carry only what the connector is allowed to show: never SSNs, dates of
// birth, bank/account numbers or file contents.

export interface TeamUser {
  id: string;
  name: string | null;
  email: string | null;
}

export interface DealRow {
  id: string;
  loanNumber: number;
  borrowerName: string;
  propertyAddress: string;
  loanCategory: string;
  stage: string;
  pausedFromStage: string | null;
  lenderName: string | null;
  productName: string | null;
  loanOfficerId: string | null;
  processorId: string | null;
  assistantId: string | null;
  loanAmountRequested: string;
  approvedLoanAmount: string | null;
  estimatedClosingDate: Date | null;
  creditPullDate: Date | null;
  rateLockedAt: Date | null;
  rateLockExpiresAt: Date | null;
  clearToCloseDate: Date | null;
  closedDate: Date | null;
  referralPartnerName: string | null;
  referralPartnerType: string | null;
  lostReason: string | null;
  createdAt: Date;
}

export interface StageHistoryRow {
  stage: string;
  changedAt: Date;
  changedByName: string | null;
}

export interface ConditionRow {
  id: string;
  category: string;
  description: string;
  status: string;
  processorNote: string | null;
  createdAt: Date;
  clearedAt: Date | null;
}

export interface KeyDateRow {
  item: string;
  status: string;
  eventDate: Date;
}

export interface NeedDocumentRow {
  needId: string;
  fileName: string;
  reviewStatus: string;
  uploadedAt: Date;
  /** "borrower" for the public upload link; otherwise the staff member who uploaded it. */
  uploadedBy: string;
  rejectionNote: string | null;
}

export interface NeedRow {
  id: string;
  dealId: string;
  itemName: string;
  description: string | null;
  status: string;
  needType: string;
  onHoldAt: Date | null;
  createdAt: Date;
  sentAt: Date | null;
  acceptedAt: Date | null;
  requestedByUserId: string | null;
  sentByUserId: string | null;
  responsibleParty: string | null;
  blocks: string | null;
  /** Most recent "client needs" email (automatic or manual) that named this need. */
  lastReminderAt: Date | null;
  lastReminderKind: "automatic" | "manual" | null;
  /** Latest borrower upload, questionnaire answer or form submission on this need. */
  lastBorrowerActivityAt: Date | null;
}

export type ActivityType =
  | "stage_change"
  | "need_added"
  | "need_cleared"
  | "upload"
  | "borrower_submission"
  | "note"
  | "email";

export interface ActivityRow {
  type: ActivityType;
  occurredAt: Date;
  dealId: string;
  /** Stable tie-break so two events in the same millisecond keep one order. */
  sourceId: string;
  actor: string | null;
  summary: string;
}

/** Everything the five tools read. data.ts implements it over a read-only transaction. */
export interface McpData {
  listTeam(): Promise<TeamUser[]>;
  /** Deals not deleted or archived; `stages` limits them, omitted means every stage. */
  listDeals(q: { stages?: string[] }): Promise<DealRow[]>;
  /** By id (uuid) or loan number. Archived deals are included; deleted ones are not. */
  findDeal(ref: { id?: string; loanNumber?: number }): Promise<DealRow | null>;
  stageCounts(): Promise<Record<string, number>>;
  lastActivity(dealIds: string[]): Promise<Map<string, Date>>;
  stageHistory(dealId: string): Promise<StageHistoryRow[]>;
  conditions(dealId: string): Promise<ConditionRow[]>;
  keyDateEvents(dealId: string): Promise<KeyDateRow[]>;
  /** Client needs for these deals. `outstandingOnly` drops accepted, unused and on-hold needs. */
  needs(q: { dealIds: string[]; outstandingOnly: boolean }): Promise<NeedRow[]>;
  needDocuments(dealId: string): Promise<NeedDocumentRow[]>;
  recentActivity(q: { since: Date; dealId?: string; perSourceLimit: number }): Promise<ActivityRow[]>;
}
