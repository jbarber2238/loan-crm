import { describe, expect, it } from "vitest";
import { categoriesFor, categoryFor, mayReceive, pushWanted } from "@/lib/notification-categories";

const proc = { id: "p1", isAdmin: false, baseRole: "processor", active: true };
const admin = { id: "a1", isAdmin: true, baseRole: "loan_officer", active: true };
const lo = { id: "l1", isAdmin: false, baseRole: "loan_officer", active: true };
const deal = { loId: "l1", procId: "p1", asstId: null };

describe("mayReceive", () => {
  it("tells a processor about their own deals", () => {
    expect(mayReceive(proc, { type: "client_needs_completed", dealId: "d1" }, deal)).toBe(true);
  });
  it("does not tell a processor about someone else's deal", () => {
    expect(mayReceive(proc, { type: "client_needs_completed", dealId: "d2" }, { loId: "l1", procId: "p2", asstId: null })).toBe(false);
  });
  it("keeps every business-wide alert away from processors", () => {
    for (const type of ["friday_signup", "partner_referral", "marketing_alert", "follow_up_due", "closing_survey", "friday_zoom_error"]) {
      expect(mayReceive(proc, { type, dealId: null }, null)).toBe(false);
    }
  });
  it("lets direct messages through to a processor", () => {
    expect(mayReceive(proc, { type: "direct_message", dealId: null }, null)).toBe(true);
  });
  it("never reaches an inactive person", () => {
    expect(mayReceive({ ...proc, active: false }, { type: "direct_message", dealId: null }, null)).toBe(false);
  });
  it("leaves admins and loan officers as they were", () => {
    expect(mayReceive(admin, { type: "friday_signup", dealId: null }, null)).toBe(true);
    expect(mayReceive(lo, { type: "term_sheet_accepted", dealId: "d1" }, deal)).toBe(true);
  });
});

describe("categories", () => {
  it("maps known types and falls back sensibly", () => {
    expect(categoryFor("inbound_text", true)).toBe("texts");
    expect(categoryFor("friday_signup", false)).toBe("leads");
    expect(categoryFor("brand_new_type", true)).toBe("deals");
    expect(categoryFor("brand_new_type", false)).toBe("system");
  });
  it("shows processors and loan officers only the non-admin switches", () => {
    expect(categoriesFor(false).map((c) => c.id)).toEqual(["deals", "texts", "chat_direct", "chat_general"]);
    expect(categoriesFor(true).length).toBeGreaterThan(4);
  });
  it("uses the default until a choice is made", () => {
    expect(pushWanted("deals", new Map())).toBe(true);
    expect(pushWanted("chat_general", new Map())).toBe(false);
    expect(pushWanted("deals", new Map([["deals", false]]))).toBe(false);
  });
});
