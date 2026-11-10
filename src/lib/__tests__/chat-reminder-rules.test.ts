import { describe, expect, it } from "vitest";
import { reminderDue, withinReminderHours } from "@/lib/chat-reminder-rules";

const at = (iso: string) => new Date(iso);

describe("reminderDue", () => {
  const now = at("2026-11-10T15:00:00Z");
  it("is not due before 10 minutes", () => {
    expect(reminderDue(at("2026-11-10T14:55:00Z"), now)).toBe(false);
    expect(reminderDue(at("2026-11-10T14:50:01Z"), now)).toBe(false);
  });
  it("is due in the one 5-minute slot after 10 minutes", () => {
    expect(reminderDue(at("2026-11-10T14:50:00Z"), now)).toBe(true);
    expect(reminderDue(at("2026-11-10T14:45:01Z"), now)).toBe(true);
  });
  it("is not due again once the slot has passed", () => {
    expect(reminderDue(at("2026-11-10T14:45:00Z"), now)).toBe(false);
    expect(reminderDue(at("2026-11-10T09:00:00Z"), now)).toBe(false);
  });
});

describe("withinReminderHours", () => {
  it("allows 7 AM to 9 PM Eastern and nothing overnight", () => {
    expect(withinReminderHours(at("2026-11-10T12:00:00Z"))).toBe(true); // 7:00 AM EST
    expect(withinReminderHours(at("2026-11-10T11:59:00Z"))).toBe(false); // 6:59 AM EST
    expect(withinReminderHours(at("2026-11-11T01:59:00Z"))).toBe(true); // 8:59 PM EST
    expect(withinReminderHours(at("2026-11-11T02:00:00Z"))).toBe(false); // 9:00 PM EST
  });
});
