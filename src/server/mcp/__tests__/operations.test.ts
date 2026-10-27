import { describe, expect, it } from "vitest";
import { getLoan, listOpenLoans, listOutstandingNeeds, listRecentActivity, pipelineSummary } from "../operations";
import { McpInputError } from "../pagination";
import { A, D, NOW, fakeData } from "./fixtures";

describe("list_open_loans", () => {
  it("returns open loans only, soonest target close first, with the requested fields", async () => {
    const page = await listOpenLoans(fakeData(), {});
    expect(page.total).toBe(3);
    expect(page.items.map((l) => l.loan_number)).toEqual([1002, 1001, 1003]);
    const a = page.items.find((l) => l.loan_number === 1001)!;
    expect(a).toMatchObject({
      loan_id: A,
      borrower_name: "Acme Holdings",
      property_address: "1001 Main St, Austin TX",
      loan_type: "DSCR",
      lender: "Kiavi",
      stage: "underwriting_review",
      loan_officer: "Justin Barber",
      processor: "Pat Processor",
    });
    expect(a.target_close_date).toBe("2026-11-02T15:00:00.000Z");
    expect(a.last_activity_at).toBe("2026-10-27T13:00:00.000Z");
  });

  it("names the loan types the way the team does", async () => {
    const page = await listOpenLoans(fakeData(), {});
    const types = Object.fromEntries(page.items.map((l) => [l.loan_number, l.loan_type]));
    expect(types).toEqual({ 1001: "DSCR", 1002: "Fix and flip", 1003: "Ground up" });
  });

  it("falls back to the deal's creation time when nothing has happened on it", async () => {
    const page = await listOpenLoans(fakeData(), { stage: "on_hold" });
    expect(page.items.map((l) => l.loan_number)).toEqual([1005]);
    expect(page.items[0].last_activity_at).toBe("2026-10-18T15:00:00.000Z");
  });

  it("filters by stage and rejects a stage that does not exist", async () => {
    expect((await listOpenLoans(fakeData(), { stage: "clear_to_close" })).items.map((l) => l.loan_number)).toEqual([1002]);
    await expect(listOpenLoans(fakeData(), { stage: "bogus" })).rejects.toBeInstanceOf(McpInputError);
  });

  it("filters by assignee on name, email or id, and lists the team when nobody matches", async () => {
    expect((await listOpenLoans(fakeData(), { assigned_to: "pat" })).items.map((l) => l.loan_number)).toEqual([1002, 1001]);
    expect((await listOpenLoans(fakeData(), { assigned_to: "sam@example.com" })).items.map((l) => l.loan_number)).toEqual([1003]);
    expect((await listOpenLoans(fakeData(), { assigned_to: "u-justin" })).total).toBe(3);
    await expect(listOpenLoans(fakeData(), { assigned_to: "nobody" })).rejects.toThrow(/Pat Processor/);
  });

  it("paginates with an opaque cursor", async () => {
    const first = await listOpenLoans(fakeData(), { limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.next_cursor).not.toBeNull();
    const second = await listOpenLoans(fakeData(), { limit: 2, cursor: first.next_cursor! });
    expect(second.items.map((l) => l.loan_number)).toEqual([1003]);
    expect(second.next_cursor).toBeNull();
    await expect(listOpenLoans(fakeData(), { cursor: "not-a-cursor" })).rejects.toBeInstanceOf(McpInputError);
  });
});

describe("get_loan", () => {
  it("accepts the uuid, the loan number, or #number", async () => {
    for (const id of [A, "1001", "#1001"]) {
      expect((await getLoan(fakeData(), { loan_id: id }, NOW)).loan_number).toBe(1001);
    }
  });

  it("returns stage history with timestamps, conditions, team, referral partner and key dates", async () => {
    const loan = await getLoan(fakeData(), { loan_id: A }, NOW);
    expect(loan.stage_history.map((h) => h.stage)).toEqual(["new", "application", "underwriting_review"]);
    expect(loan.stage_history[0]).toMatchObject({ entered_at: "2026-10-07T15:00:00.000Z", changed_by: "Justin Barber", hours_in_stage: 240, current: false });
    expect(loan.stage_history[2]).toMatchObject({ current: true, hours_in_stage: 48 });
    expect(loan.conditions).toHaveLength(1);
    expect(loan.assigned_team).toEqual({ loan_officer: "Justin Barber", processor: "Pat Processor", loan_officer_assistant: null });
    expect(loan.referral_partner).toEqual({ name: "Riley Realty", type: "agent" });
    expect(loan.key_dates.appraisal).toEqual({ status: "received", date: "2026-10-26T19:00:00.000Z" });
    expect(loan.key_dates.title?.status).toBe("ordered");
    expect(loan.key_dates.insurance).toBeNull();
    expect(loan.key_dates.rate_locked_at).toBe("2026-10-24T15:00:00.000Z");
  });

  it("lists every client need with document names and statuses, and counts the outstanding ones", async () => {
    const loan = await getLoan(fakeData(), { loan_id: A }, NOW);
    expect(loan.client_needs.map((n) => n.item)).toEqual(["Appraisal", "Title Commitment", "Bank Statements"]);
    expect(loan.client_needs_summary).toEqual({ total: 3, outstanding: 2, accepted: 0 });
    const bank = loan.client_needs.find((n) => n.item === "Bank Statements")!;
    expect(bank.documents).toHaveLength(1);
    expect(bank.documents[0]).toMatchObject({ review_status: "pending", uploaded_by: "borrower_or_system" });
    expect(Object.keys(bank.documents[0]).sort()).toEqual(["file_name", "rejection_note", "review_status", "uploaded_at", "uploaded_by"]);
  });

  it("never returns SSNs or long account numbers, even from free text and file names", async () => {
    const text = JSON.stringify(await getLoan(fakeData(), { loan_id: A }, NOW));
    expect(text).not.toContain("123-45-6789");
    expect(text).not.toContain("123456789012");
    expect(text).toContain("[redacted]");
  });

  it("rejects a loan that does not exist or an id that is not an id", async () => {
    await expect(getLoan(fakeData(), { loan_id: "9999" }, NOW)).rejects.toThrow(/No loan found/);
    await expect(getLoan(fakeData(), { loan_id: "abc; drop table" }, NOW)).rejects.toBeInstanceOf(McpInputError);
  });
});

describe("list_outstanding_needs", () => {
  it("returns open needs on open loans, oldest first, leaving out accepted, on-hold and closed-loan needs", async () => {
    const page = await listOutstandingNeeds(fakeData(), {}, NOW);
    expect(page.items.map((n) => n.need_id)).toEqual(["n3", "n1", "n5", "n2", "n7"]);
    expect(page.items.map((n) => n.age_hours)).toEqual([100, 80, 60, 30, 10]);
  });

  it("filters by age, loan and assignee", async () => {
    expect((await listOutstandingNeeds(fakeData(), { older_than_hours: 48 }, NOW)).items.map((n) => n.need_id)).toEqual(["n3", "n1", "n5"]);
    expect((await listOutstandingNeeds(fakeData(), { loan_id: "1001" }, NOW)).items.map((n) => n.need_id)).toEqual(["n1", "n2"]);
    expect((await listOutstandingNeeds(fakeData(), { assigned_to: "Sam" }, NOW)).items.map((n) => n.need_id)).toEqual(["n5", "n7"]);
  });

  it("can look at a single loan in any stage", async () => {
    const page = await listOutstandingNeeds(fakeData(), { loan_id: D }, NOW);
    expect(page.items.map((n) => n.need_id)).toEqual(["n8"]);
  });

  it("says who owes each item: the processor for review and unsent items, otherwise the recorded or guessed party", async () => {
    const byId = Object.fromEntries((await listOutstandingNeeds(fakeData(), {}, NOW)).items.map((n) => [n.need_id, n]));
    expect(byId.n2).toMatchObject({ owed_by: "processor", owed_by_inferred: false });
    expect(byId.n5).toMatchObject({ owed_by: "processor", owed_by_inferred: false });
    expect(byId.n3).toMatchObject({ owed_by: "insurance", owed_by_inferred: false });
    expect(byId.n1).toMatchObject({ owed_by: "title", owed_by_inferred: true });
    expect(byId.n7).toMatchObject({ owed_by: "borrower", owed_by_inferred: true });
  });

  it("says what each item blocks, marking guesses as guesses", async () => {
    const byId = Object.fromEntries((await listOutstandingNeeds(fakeData(), {}, NOW)).items.map((n) => [n.need_id, n]));
    expect(byId.n3).toMatchObject({ blocks: "closing", blocks_inferred: false });
    expect(byId.n1).toMatchObject({ blocks: "closing", blocks_inferred: true });
    expect(byId.n2).toMatchObject({ blocks: "underwriting", blocks_inferred: true });
  });

  it("reports who requested it, the last reminder and the borrower's last activity", async () => {
    const byId = Object.fromEntries((await listOutstandingNeeds(fakeData(), {}, NOW)).items.map((n) => [n.need_id, n]));
    expect(byId.n2).toMatchObject({ requested_by: "Pat Processor", requested_by_source: "recorded", last_borrower_activity_at: "2026-10-27T13:00:00.000Z" });
    expect(byId.n1).toMatchObject({ requested_by: "Pat Processor", requested_by_source: "inferred_from_first_sender", last_reminder_sent_at: "2026-10-26T19:00:00.000Z", last_reminder_kind: "automatic" });
    expect(byId.n3).toMatchObject({ requested_by: null, requested_by_source: "unknown", last_reminder_kind: "manual" });
    expect(byId.n3.requested_at).toBe("2026-10-23T11:00:00.000Z");
  });

  it("paginates", async () => {
    const first = await listOutstandingNeeds(fakeData(), { limit: 2 }, NOW);
    expect(first.total).toBe(5);
    const second = await listOutstandingNeeds(fakeData(), { limit: 2, cursor: first.next_cursor! }, NOW);
    expect(second.items.map((n) => n.need_id)).toEqual(["n5", "n2"]);
  });
});

describe("list_recent_activity", () => {
  const since = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();

  it("merges every source newest first", async () => {
    const result = await listRecentActivity(fakeData(), { since: since(24) }, NOW);
    expect(result.items.map((i) => i.type)).toEqual(["email", "upload", "note"]);
    expect(result.items[0]).toMatchObject({ loan_number: 1003, borrower_name: "Carter Builds", actor: "Sam Assistant" });
    const wide = await listRecentActivity(fakeData(), { since: since(24 * 10) }, NOW);
    expect(wide.items.map((i) => i.type)).toEqual(["email", "upload", "note", "stage_change", "need_added", "need_cleared"]);
  });

  it("limits to one loan", async () => {
    const result = await listRecentActivity(fakeData(), { since: since(24 * 10), loan_id: "#1002" }, NOW);
    expect(result.items.map((i) => i.type)).toEqual(["note", "need_cleared"]);
  });

  it("paginates and clamps very old starting points to 90 days", async () => {
    const first = await listRecentActivity(fakeData(), { since: since(24 * 10), limit: 4 }, NOW);
    expect(first.items).toHaveLength(4);
    const second = await listRecentActivity(fakeData(), { since: since(24 * 10), limit: 4, cursor: first.next_cursor! }, NOW);
    expect(second.items).toHaveLength(2);
    expect(second.next_cursor).toBeNull();
    const old = await listRecentActivity(fakeData(), { since: "2020-01-01T00:00:00Z" }, NOW);
    expect(old.since_clamped_to_90_days).toBe(true);
  });

  it("rejects a bad or future since", async () => {
    await expect(listRecentActivity(fakeData(), { since: "yesterday-ish" }, NOW)).rejects.toBeInstanceOf(McpInputError);
    await expect(listRecentActivity(fakeData(), { since: "2030-01-01T00:00:00Z" }, NOW)).rejects.toBeInstanceOf(McpInputError);
  });
});

describe("pipeline_summary", () => {
  it("counts loans by stage, including open stages with none", async () => {
    const s = await pipelineSummary(fakeData(), NOW);
    const counts = Object.fromEntries(s.counts_by_stage.map((c) => [c.stage, c.count]));
    expect(counts).toMatchObject({ new: 0, application: 1, underwriting_review: 1, clear_to_close: 1, closed: 1, on_hold: 1 });
    expect(s.open_loans).toBe(3);
    expect(s.counts_by_stage.find((c) => c.stage === "closed")?.open).toBe(false);
  });

  it("flags open loans with no activity in 3+ days", async () => {
    const s = await pipelineSummary(fakeData(), NOW);
    expect(s.no_activity_3_plus_days.total).toBe(1);
    expect(s.no_activity_3_plus_days.loans[0]).toMatchObject({ loan_number: 1002, days_since_activity: 5 });
  });

  it("groups needs older than 48 hours by who owes them", async () => {
    const s = await pipelineSummary(fakeData(), NOW);
    expect(s.needs_older_than_48_hours.total).toBe(3);
    const owners = Object.fromEntries(s.needs_older_than_48_hours.by_owner.map((g) => [g.owed_by, g]));
    expect(owners.processor.count).toBe(1);
    expect(owners.title.needs[0]).toMatchObject({ need_id: "n1", age_hours: 80 });
    expect(owners.insurance.oldest_age_hours).toBe(100);
    expect(owners.borrower).toBeUndefined();
  });

  it("lists open loans with a target close in the next 10 days", async () => {
    const s = await pipelineSummary(fakeData(), NOW);
    expect(s.closing_in_next_10_days.loans.map((l) => l.loan_number)).toEqual([1002, 1001]);
  });

  it("returns ISO timestamps", async () => {
    const s = await pipelineSummary(fakeData(), NOW);
    expect(s.as_of).toBe("2026-10-27T15:00:00.000Z");
  });
});
