import { describe, expect, it } from "vitest";
import { shouldRestoreOnMove } from "@/lib/client-need-status";

describe("shouldRestoreOnMove", () => {
  it("restores a rejected document moved into a need that isn't rejected", () => {
    expect(shouldRestoreOnMove("rejected", "awaiting_docs")).toBe(true);
    expect(shouldRestoreOnMove("rejected", "not_sent")).toBe(true);
    expect(shouldRestoreOnMove("rejected", "review_needed")).toBe(true);
    expect(shouldRestoreOnMove("rejected", "accepted")).toBe(true);
    expect(shouldRestoreOnMove("rejected", null)).toBe(true); // a brand-new need
  });

  it("leaves it rejected when the destination need is itself rejected", () => {
    expect(shouldRestoreOnMove("rejected", "need_rejected_not_sent")).toBe(false);
    expect(shouldRestoreOnMove("rejected", "document_rejected_not_sent")).toBe(false);
  });

  it("never changes a document that isn't rejected (e.g. one moved out of Unused)", () => {
    expect(shouldRestoreOnMove("pending", "awaiting_docs")).toBe(false);
    expect(shouldRestoreOnMove("approved", "awaiting_docs")).toBe(false);
  });
});
