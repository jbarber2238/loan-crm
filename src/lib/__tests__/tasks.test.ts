import { describe, expect, it } from "vitest";
import {
  EOD_TEMPLATE,
  addDays,
  coverageActive,
  dueAtFrom,
  dueBucket,
  dueLabel,
  hasOutstandingSection,
  parseUpdateSections,
  reminderKind,
  updateAgeChip,
  updateAgeDays,
  withOutstandingSection,
  withStandContext,
} from "@/lib/tasks";

describe("dueAtFrom", () => {
  it("turns an Eastern date and time into the right instant, in winter and summer", () => {
    expect(dueAtFrom("2026-01-15", "15:00")?.toISOString()).toBe("2026-01-15T20:00:00.000Z"); // EST, UTC-5
    expect(dueAtFrom("2026-07-15", "15:00")?.toISOString()).toBe("2026-07-15T19:00:00.000Z"); // EDT, UTC-4
  });
  it("is null without both a date and a time", () => {
    expect(dueAtFrom("2026-01-15", null)).toBeNull();
    expect(dueAtFrom(null, "09:00")).toBeNull();
    expect(dueAtFrom("2026-02-30", "09:00")).toBeNull();
  });
});

describe("dueBucket / dueLabel", () => {
  const today = "2026-11-16";
  it("sorts tasks into groups", () => {
    expect(dueBucket("2026-11-15", today)).toBe("overdue");
    expect(dueBucket("2026-11-16", today)).toBe("today");
    expect(dueBucket("2026-11-23", today)).toBe("week");
    expect(dueBucket("2026-11-24", today)).toBe("later");
    expect(dueBucket(null, today)).toBe("none");
  });
  it("labels the due chip", () => {
    expect(dueLabel("2026-11-14", null, today)).toEqual({ text: "Overdue · 2d", tone: "bad" });
    expect(dueLabel("2026-11-16", "15:00", today)).toEqual({ text: "Due today · 3:00 PM", tone: "warn" });
    expect(dueLabel("2026-11-17", "09:05", today).text).toBe("Tomorrow · 9:05 AM");
    expect(dueLabel("2026-11-20", null, today).text).toBe("Nov 20");
  });
  it("adds days across a month end", () => {
    expect(addDays("2026-11-28", 5)).toBe("2026-12-03");
  });
});

describe("reminderKind", () => {
  const due = new Date("2026-11-16T20:00:00Z");
  const at = (min: number) => new Date(due.getTime() + min * 60_000);
  it("does nothing when reminders are off", () => {
    expect(reminderKind(due, at(0), "off")).toBeNull();
  });
  it("fires at the due time", () => {
    expect(reminderKind(due, at(-1), "now")).toBeNull();
    expect(reminderKind(due, at(0), "now")).toBe("now");
    expect(reminderKind(due, at(10), "now")).toBe("now");
    expect(reminderKind(due, at(40), "now")).toBe("late");
    expect(reminderKind(due, at(13 * 60), "now")).toBeNull();
  });
  it("adds a 15-minute heads-up when asked", () => {
    expect(reminderKind(due, at(-16), "both")).toBeNull();
    expect(reminderKind(due, at(-15), "both")).toBe("soon");
    expect(reminderKind(due, at(-1), "both")).toBe("soon");
    expect(reminderKind(due, at(-1), "now")).toBeNull();
  });
});

describe("coverage", () => {
  it("is active between the first and last day, inclusive", () => {
    const c = { startDate: "2026-11-16", endDate: "2026-11-20" };
    expect(coverageActive(c, "2026-11-15")).toBe(false);
    expect(coverageActive(c, "2026-11-16")).toBe(true);
    expect(coverageActive(c, "2026-11-20")).toBe(true);
    expect(coverageActive(c, "2026-11-21")).toBe(false);
  });
});

describe("end-of-day update text", () => {
  it("starts with just Where we stand and Issues", () => {
    expect(EOD_TEMPLATE).toContain("WHERE WE STAND:");
    expect(EOD_TEMPLATE).toContain("ISSUES & HOW WE’RE RESOLVING:");
    expect(hasOutstandingSection(EOD_TEMPLATE)).toBe(false);
  });
  it("adds Outstanding between the two sections, and refreshes it instead of repeating it", () => {
    const filled = "WHERE WE STAND:\nTitle ordered.\n\nISSUES & HOW WE’RE RESOLVING:\nNone.\n";
    const once = withOutstandingSection(filled, ["Insurance binder", "W-9"]);
    expect(once.indexOf("WHERE WE STAND:")).toBeLessThan(once.indexOf("OUTSTANDING:"));
    expect(once.indexOf("OUTSTANDING:")).toBeLessThan(once.indexOf("ISSUES"));
    expect(once).toContain("• Insurance binder");
    const twice = withOutstandingSection(once, ["Bank statements"]);
    expect(twice.match(/OUTSTANDING:/g)).toHaveLength(1);
    expect(twice).toContain("• Bank statements");
    expect(twice).not.toContain("Insurance binder");
    expect(twice).toContain("Title ordered.");
    expect(twice).toContain("None.");
  });
  it("starts from the template when the draft is empty, and says so when nothing is outstanding", () => {
    const out = withOutstandingSection("", []);
    expect(out).toContain("WHERE WE STAND:");
    expect(out).toContain("Nothing. All client needs are in.");
  });
  it("splits an update into its sections", () => {
    const body = "WHERE WE STAND:\nUW has it.\n\nOUTSTANDING:\n• Binder\n\nISSUES & HOW WE’RE RESOLVING:\nNone.";
    const s = parseUpdateSections(body)!;
    expect(s.map((x) => x.key)).toEqual(["stand", "outstanding", "issues"]);
    expect(s[0].text).toBe("UW has it.");
    expect(s[2].text).toBe("None.");
    expect(parseUpdateSections("just some words")).toBeNull();
    expect(parseUpdateSections("WHERE WE STAND:\nx\n\nISSUES & HOW WE’RE RESOLVING:\ny")!).toHaveLength(2);
  });
});

describe("update age", () => {
  const now = new Date("2026-11-16T17:00:00Z");
  it("counts Eastern days", () => {
    expect(updateAgeDays(new Date("2026-11-16T14:00:00Z"), now)).toBe(0);
    expect(updateAgeDays(new Date("2026-11-11T21:52:00Z"), now)).toBe(5);
  });
  it("words the chip", () => {
    expect(updateAgeChip(0)).toEqual({ text: "Posted today", tone: "ok" });
    expect(updateAgeChip(1).text).toBe("Posted yesterday");
    expect(updateAgeChip(3)).toEqual({ text: "3 days since update", tone: "warn" });
    expect(updateAgeChip(5).tone).toBe("bad");
  });
});

describe("withStandContext", () => {
  const lines = ["Appraisal: Scheduled (11/12/2026)", "Title: Not ordered"];
  it("adds the block under Where we stand in a fresh draft", () => {
    const out = withStandContext(EOD_TEMPLATE, lines);
    expect(out.startsWith("WHERE WE STAND:\nKEY DATES AND STATUS:\n• Appraisal: Scheduled (11/12/2026)\n• Title: Not ordered\n")).toBe(true);
    expect(out).toContain("ISSUES & HOW WE’RE RESOLVING:");
  });
  it("keeps what was already typed and doesn't double up when pulled again", () => {
    const typed = "WHERE WE STAND:\nUnderwriting has the file.\n\n\nISSUES & HOW WE’RE RESOLVING:\nNone.\n";
    const once = withStandContext(typed, lines);
    expect(once).toContain("Underwriting has the file.");
    const twice = withStandContext(once, ["Appraisal: Complete (11/14/2026)"]);
    expect(twice.match(/KEY DATES AND STATUS:/g)).toHaveLength(1);
    expect(twice).toContain("Appraisal: Complete (11/14/2026)");
    expect(twice).not.toContain("Scheduled");
    expect(twice).toContain("Underwriting has the file.");
    expect(twice).toContain("None.");
  });
  it("still lands in the Where we stand section after an Outstanding section was added", () => {
    const withOut = withOutstandingSection(EOD_TEMPLATE, ["W-9 (Awaiting docs)"]);
    const out = withStandContext(withOut, lines);
    const sections = parseUpdateSections(out)!;
    expect(sections.find((s) => s.key === "stand")!.text).toContain("Appraisal: Scheduled");
    expect(sections.find((s) => s.key === "outstanding")!.text).toContain("W-9");
  });
});
