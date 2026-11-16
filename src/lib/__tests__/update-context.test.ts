import { describe, expect, it } from "vitest";
import { standContextLines, type StandContextInput } from "@/lib/update-context";

const none = { status: null, day: null, notes: null };
const base: StandContextInput = {
  appraisal: none,
  insurance: none,
  title: none,
  estimatedClosingDay: null,
  rateLockExpiresDay: null,
  payoffExpirationDay: null,
  creditPullDay: null,
  clearToCloseDay: null,
  closedDay: null,
};

describe("standContextLines", () => {
  it("always lists appraisal, insurance and title first, even when nothing is ordered", () => {
    expect(standContextLines(base)).toEqual(["Appraisal: Not ordered", "Insurance (HOI): Not ordered", "Title: Not ordered"]);
  });
  it("shows status, date and notes, then the key dates that are set", () => {
    const lines = standContextLines({
      ...base,
      appraisal: { status: "Scheduled", day: "2026-11-12", notes: "Inspection\nThursday 10am" },
      title: { status: "Received", day: "2026-11-10", notes: null },
      estimatedClosingDay: "2026-12-04",
      payoffExpirationDay: "2026-12-10",
    });
    expect(lines).toEqual([
      "Appraisal: Scheduled (11/12/2026). Inspection Thursday 10am",
      "Insurance (HOI): Not ordered",
      "Title: Received (11/10/2026)",
      "Est. closing: 12/4/2026",
      "Payoff expires: 12/10/2026",
    ]);
  });
  it("trims very long notes to one short line", () => {
    const [line] = standContextLines({ ...base, appraisal: { status: "Ordered", day: null, notes: "x".repeat(400) } });
    expect(line.length).toBeLessThan(200);
    expect(line.endsWith("…")).toBe(true);
  });
});
