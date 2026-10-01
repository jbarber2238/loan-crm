import { describe, it, expect } from "vitest";
import { deriveNeedStatus } from "@/lib/client-need-status";

const hourAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);

describe("deriveNeedStatus", () => {
  it("is review_needed when a document is still pending, even with another approved", () => {
    const status = deriveNeedStatus({
      acceptedAt: null,
      sentAt: hourAgo(2),
      lastSentAt: null,
      documents: [
        { reviewStatus: "approved", reviewedAt: hourAgo(1) },
        { reviewStatus: "pending", reviewedAt: null },
      ],
    });
    expect(status).toBe("review_needed");
  });

  it("is document_rejected_not_sent for a partial rejection the processor hasn't resent", () => {
    const status = deriveNeedStatus({
      acceptedAt: null,
      sentAt: hourAgo(5),
      lastSentAt: hourAgo(4), // sent before the rejection below — hasn't been told
      documents: [
        { reviewStatus: "approved", reviewedAt: hourAgo(3) },
        { reviewStatus: "rejected", reviewedAt: hourAgo(2) },
      ],
    });
    expect(status).toBe("document_rejected_not_sent");
  });

  it("stays awaiting_docs even once every document is approved — approving documents never accepts the need by itself", () => {
    const status = deriveNeedStatus({
      acceptedAt: null,
      sentAt: hourAgo(5),
      lastSentAt: null,
      documents: [
        { reviewStatus: "approved", reviewedAt: hourAgo(2) },
        { reviewStatus: "approved", reviewedAt: hourAgo(1) },
      ],
    });
    expect(status).toBe("awaiting_docs");
  });

  it("stays awaiting_docs for a plain single-document need with its one document approved (the original bug)", () => {
    const status = deriveNeedStatus({
      acceptedAt: null,
      sentAt: hourAgo(1),
      lastSentAt: null,
      documents: [{ reviewStatus: "approved", reviewedAt: hourAgo(1) }],
    });
    expect(status).toBe("awaiting_docs");
  });

  it("is accepted once acceptedAt is set, regardless of how many documents are approved", () => {
    const status = deriveNeedStatus({
      acceptedAt: hourAgo(1),
      sentAt: hourAgo(2),
      lastSentAt: null,
      documents: [{ reviewStatus: "approved", reviewedAt: hourAgo(1) }],
    });
    expect(status).toBe("accepted");
  });

  it("an older rejected document doesn't stop acceptedAt from winning", () => {
    const status = deriveNeedStatus({
      acceptedAt: hourAgo(1),
      sentAt: hourAgo(5),
      lastSentAt: null,
      documents: [
        { reviewStatus: "approved", reviewedAt: hourAgo(2) },
        { reviewStatus: "rejected", reviewedAt: hourAgo(4) },
      ],
    });
    expect(status).toBe("accepted");
  });

  it("is need_rejected_not_sent when the need's only document is rejected", () => {
    const status = deriveNeedStatus({
      acceptedAt: null,
      sentAt: hourAgo(2),
      lastSentAt: null,
      documents: [{ reviewStatus: "rejected", reviewedAt: hourAgo(1) }],
    });
    expect(status).toBe("need_rejected_not_sent");
  });

  it("is need_rejected_not_sent when every document on a multi-document need is rejected", () => {
    const status = deriveNeedStatus({
      acceptedAt: null,
      sentAt: hourAgo(3),
      lastSentAt: null,
      documents: [
        { reviewStatus: "rejected", reviewedAt: hourAgo(2) },
        { reviewStatus: "rejected", reviewedAt: hourAgo(1) },
      ],
    });
    expect(status).toBe("need_rejected_not_sent");
  });

  it("clears the rejected tag back to awaiting_docs once manually resent after the rejection", () => {
    const status = deriveNeedStatus({
      acceptedAt: null,
      sentAt: hourAgo(5),
      lastSentAt: hourAgo(1), // sent AFTER the rejection below
      documents: [
        { reviewStatus: "approved", reviewedAt: hourAgo(3) },
        { reviewStatus: "rejected", reviewedAt: hourAgo(2) },
      ],
    });
    expect(status).toBe("awaiting_docs");
  });

  it("is not_sent with no documents and never sent", () => {
    expect(deriveNeedStatus({ acceptedAt: null, sentAt: null, lastSentAt: null, documents: [] })).toBe("not_sent");
  });

  it("is awaiting_docs with no documents but already sent", () => {
    expect(deriveNeedStatus({ acceptedAt: null, sentAt: hourAgo(1), lastSentAt: null, documents: [] })).toBe(
      "awaiting_docs"
    );
  });
});
