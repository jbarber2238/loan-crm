import { describe, expect, it } from "vitest";
import { canMarkSentToLender, canMarkSentToLenderAnyway, conditionOwner, isUnbackedBorrowerCondition, needsClientNeed, type OwnerInput } from "../condition-owner";

const base: OwnerInput = { category: "borrower", status: "open", sentToLenderAt: null, linkedNeed: { status: "not_sent", onHoldAt: null } };
const owner = (patch: Partial<OwnerInput>) => conditionOwner({ ...base, ...patch })?.key ?? null;
const need = (status: string, onHoldAt: Date | null = null) => ({ linkedNeed: { status, onHoldAt } });

describe("conditionOwner", () => {
  it("has no owner for title, insurance or other conditions, or cleared ones", () => {
    expect(owner({ category: "title" })).toBeNull();
    expect(owner({ category: "insurance" })).toBeNull();
    expect(owner({ category: "other" })).toBeNull();
    expect(owner({ status: "cleared" })).toBeNull();
  });
  it("keeps showing sent to lender once the condition is checked off by it", () => {
    expect(owner({ status: "cleared", sentToLenderAt: new Date(), ...need("accepted") })).toBe("sent_to_lender");
  });
  it("labels each step by what the processor has to do", () => {
    const label = (patch: Partial<OwnerInput>) => conditionOwner({ ...base, ...patch })?.label;
    expect(label({ linkedNeed: null })).toBe("Waiting on processor");
    expect(label(need("not_sent"))).toBe("Waiting on processor");
    expect(label(need("awaiting_docs"))).toBe("Waiting on borrower");
    expect(label(need("review_needed"))).toBe("Waiting on processor review");
    expect(label(need("accepted"))).toBe("Processor: send to lender");
  });
  it("says a borrower condition with no client need still needs one", () => {
    expect(owner({ linkedNeed: null })).toBe("needs_client_need");
  });
  it("follows the client need through sending, upload and acceptance", () => {
    expect(owner(need("not_sent"))).toBe("not_sent");
    expect(owner(need("awaiting_docs"))).toBe("waiting_borrower");
    expect(owner(need("review_needed"))).toBe("waiting_processor");
    expect(owner(need("document_rejected_not_sent"))).toBe("waiting_processor");
    expect(owner(need("need_rejected_not_sent"))).toBe("waiting_processor");
    expect(owner(need("accepted"))).toBe("ready_for_lender");
  });
  it("lets a held need read as on hold, and a sent-to-lender mark win over everything", () => {
    expect(owner(need("awaiting_docs", new Date()))).toBe("on_hold");
    expect(owner({ ...need("accepted"), sentToLenderAt: new Date() })).toBe("sent_to_lender");
  });
});

describe("canMarkSentToLender", () => {
  it("only allows accepted needs that have not been sent yet", () => {
    expect(canMarkSentToLender({ ...base, ...need("accepted") })).toBe(true);
    expect(canMarkSentToLender({ ...base, ...need("review_needed") })).toBe(false);
    expect(canMarkSentToLender({ ...base, ...need("accepted"), sentToLenderAt: new Date() })).toBe(false);
    expect(canMarkSentToLender({ ...base, category: "title" })).toBe(false);
  });
});

describe("needsClientNeed", () => {
  it("is true only for open borrower conditions with no need linked", () => {
    expect(needsClientNeed({ ...base, linkedClientNeedId: null })).toBe(true);
    expect(needsClientNeed({ ...base, linkedClientNeedId: "n1" })).toBe(false);
    expect(needsClientNeed({ ...base, status: "cleared", linkedClientNeedId: null })).toBe(false);
    expect(needsClientNeed({ ...base, category: "title", linkedClientNeedId: null })).toBe(false);
  });
});

describe("legacy clean-up", () => {
  it("lets a borrower condition with no client need be marked sent, but not one whose need is still in progress", () => {
    expect(isUnbackedBorrowerCondition({ ...base, linkedNeed: null })).toBe(true);
    expect(canMarkSentToLenderAnyway({ ...base, linkedNeed: null })).toBe(true);
    expect(canMarkSentToLenderAnyway({ ...base, ...need("accepted") })).toBe(true);
    expect(canMarkSentToLenderAnyway({ ...base, ...need("awaiting_docs") })).toBe(false);
    expect(canMarkSentToLenderAnyway({ ...base, ...need("review_needed") })).toBe(false);
  });
  it("leaves other categories, cleared and already-sent conditions alone", () => {
    expect(isUnbackedBorrowerCondition({ ...base, category: "title", linkedNeed: null })).toBe(false);
    expect(isUnbackedBorrowerCondition({ ...base, status: "cleared", linkedNeed: null })).toBe(false);
    expect(isUnbackedBorrowerCondition({ ...base, sentToLenderAt: new Date(), linkedNeed: null })).toBe(false);
  });
});
