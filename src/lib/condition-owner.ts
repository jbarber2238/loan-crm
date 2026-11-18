// Who a borrower condition is waiting on, following the client need made from it. The processor has it first (to create
// the need and send it), the borrower has it once the need is sent, and it comes back to the processor when the
// borrower uploads. After she accepts the need she marks the condition sent to the lender, which checks it off.
// Title, insurance and other conditions are a plain checklist and have no owner.

export type ConditionOwnerKey =
  | "needs_client_need"
  | "not_sent"
  | "waiting_borrower"
  | "waiting_processor"
  | "on_hold"
  | "ready_for_lender"
  | "sent_to_lender";

export type ConditionOwner = {
  key: ConditionOwnerKey;
  label: string;
  /** What the owner has to do next, shown in small print under the condition. */
  hint: string;
  tone: "muted" | "warning" | "info" | "success" | "outline";
};

export interface OwnerInput {
  category: string;
  status: "open" | "cleared";
  sentToLenderAt: Date | null;
  linkedNeed: { status: string; onHoldAt: Date | null } | null;
}

/** The owner shown on a condition, or null when none applies (not a borrower condition, or cleared some other way). */
export function conditionOwner(c: OwnerInput): ConditionOwner | null {
  if (c.category !== "borrower") return null;
  if (c.sentToLenderAt) return { key: "sent_to_lender", label: "Sent to lender", hint: "", tone: "success" };
  if (c.status === "cleared") return null;
  if (!c.linkedNeed) return { key: "needs_client_need", label: "Waiting on processor", hint: "Create the client need", tone: "info" };
  if (c.linkedNeed.onHoldAt) return { key: "on_hold", label: "Need on hold", hint: "Resume the client need to continue", tone: "outline" };
  switch (c.linkedNeed.status) {
    case "accepted":
      return { key: "ready_for_lender", label: "Processor: send to lender", hint: "Accepted. Mark it sent once it goes to the lender", tone: "info" };
    case "awaiting_docs":
      return { key: "waiting_borrower", label: "Waiting on borrower", hint: "", tone: "warning" };
    case "review_needed":
      return { key: "waiting_processor", label: "Waiting on processor review", hint: "Review what the borrower sent", tone: "info" };
    case "need_rejected_not_sent":
    case "document_rejected_not_sent":
      return { key: "waiting_processor", label: "Waiting on processor", hint: "Send the rejection back to the borrower", tone: "info" };
    default:
      return { key: "not_sent", label: "Waiting on processor", hint: "Send the client need to the borrower", tone: "info" };
  }
}

/** Conditions the processor can mark sent to the lender: borrower conditions whose client need has been accepted. */
export function canMarkSentToLender(c: OwnerInput): boolean {
  return conditionOwner(c)?.key === "ready_for_lender";
}

/** Open borrower conditions that have no client need yet, so one can be created from them. */
export function needsClientNeed(c: OwnerInput & { linkedClientNeedId: string | null }): boolean {
  return c.category === "borrower" && c.status === "open" && !c.linkedClientNeedId;
}
