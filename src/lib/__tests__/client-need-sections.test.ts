import { describe, expect, it } from "vitest";
import { groupNeedsIntoSections, lastTouchedAt, sectionOf } from "../client-need-sections";

const d = (s: string) => new Date(s);

describe("sectionOf", () => {
  it("puts a held need under On Hold whatever its status", () => {
    expect(sectionOf({ status: "accepted", onHoldAt: d("2026-11-01") })).toBe("on_hold");
    expect(sectionOf({ status: "review_needed", onHoldAt: d("2026-11-01") })).toBe("on_hold");
  });
  it("maps each status to its section", () => {
    expect(sectionOf({ status: "accepted", onHoldAt: null })).toBe("accepted");
    expect(sectionOf({ status: "review_needed", onHoldAt: null })).toBe("review_needed");
    expect(sectionOf({ status: "not_sent", onHoldAt: null })).toBe("not_sent");
    expect(sectionOf({ status: "awaiting_docs", onHoldAt: null })).toBe("awaiting");
    expect(sectionOf({ status: "need_rejected_not_sent", onHoldAt: null })).toBe("rejected");
    expect(sectionOf({ status: "document_rejected_not_sent", onHoldAt: null })).toBe("rejected");
  });
});

describe("lastTouchedAt", () => {
  it("is the newest of the need's own times and its documents' upload and review times", () => {
    const need = { createdAt: d("2026-11-01"), sentAt: d("2026-11-02"), acceptedAt: null };
    expect(lastTouchedAt(need, [{ createdAt: d("2026-11-05"), reviewedAt: d("2026-11-07") }, { createdAt: d("2026-11-03") }])).toEqual(d("2026-11-07"));
  });
  it("counts an un-accept or edit recorded in touchedAt", () => {
    expect(lastTouchedAt({ createdAt: d("2026-11-01"), acceptedAt: d("2026-11-02"), touchedAt: d("2026-11-10") })).toEqual(d("2026-11-10"));
  });
  it("falls back to when the need was added", () => {
    expect(lastTouchedAt({ createdAt: d("2026-11-01") })).toEqual(d("2026-11-01"));
  });
});

describe("groupNeedsIntoSections", () => {
  const n = (id: string, status: string, touched: string, onHoldAt: Date | null = null) => ({ id, status, onHoldAt, lastTouchedAt: d(touched) });
  it("orders sections, drops empty ones and sorts each by newest activity", () => {
    const groups = groupNeedsIntoSections([
      n("a", "not_sent", "2026-11-01"),
      n("b", "accepted", "2026-11-02"),
      n("c", "not_sent", "2026-11-09"),
      n("d", "review_needed", "2026-11-03", d("2026-11-04")),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["accepted", "not_sent", "on_hold"]);
    expect(groups[1].needs.map((x) => x.id)).toEqual(["c", "a"]);
  });
  it("keeps the original order for needs touched at the same moment", () => {
    const groups = groupNeedsIntoSections([n("x", "not_sent", "2026-11-01"), n("y", "not_sent", "2026-11-01"), n("z", "not_sent", "2026-11-01")]);
    expect(groups[0].needs.map((x) => x.id)).toEqual(["x", "y", "z"]);
  });
});
