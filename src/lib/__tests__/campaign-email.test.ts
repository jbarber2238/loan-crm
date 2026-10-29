import { describe, expect, it } from "vitest";
import { campaignTags, firstNameOf, renderCampaign, unknownTokens } from "@/lib/campaign-email";
import { applyDraftUpdate, EMPTY_DRAFT, scheduleFromAi } from "@/lib/campaign-draft";

describe("renderCampaign", () => {
  const link = (k: string) => `https://example.com/${k}`;
  it("fills merge fields and turns button lines into buttons", () => {
    const out = renderCampaign({ subject: "Hi {{firstName}}", body: "Hello {{firstName}},\n\nJoin us.\n\n{{fridayButton}}\n{{applyButton}}", name: "Terry Geier" }, link);
    expect(out.subject).toBe("Hi Terry");
    expect(out.html).toContain("Hello Terry,");
    expect(out.html).toContain("https://example.com/fridayButton");
    expect(out.html).toContain("https://example.com/applyButton");
    expect(out.html).not.toContain("{{");
  });
  it("escapes anything typed into the body", () => {
    expect(renderCampaign({ subject: "x", body: "<script>alert(1)</script>", name: "A" }, link).html).not.toContain("<script>");
  });
  it("falls back to 'there' with no name", () => {
    expect(firstNameOf("  ")).toBe("there");
  });
});

describe("unknownTokens", () => {
  it("finds made-up fields and ignores real ones", () => {
    expect(unknownTokens("{{firstName}} {{fridayButton}} {{loanAmount}}")).toEqual(["loanAmount"]);
  });
});

describe("campaignTags", () => {
  it("names the sent and clicked tags", () => {
    expect(campaignTags("Friday Zoom Invite", null)).toEqual({ sent: "campaign: friday zoom invite", clicked: "clicked: friday zoom invite" });
    expect(campaignTags("x", "oct webinar")).toEqual({ sent: "campaign: oct webinar", clicked: "clicked: oct webinar" });
  });
});

describe("applyDraftUpdate", () => {
  const labels = new Map([["all", "Everyone"], ["borrowers_closed", "Closed borrowers"]]);
  const now = new Date("2026-10-29T14:00:00Z");
  it("applies valid fields and reports each change", () => {
    const r = applyDraftUpdate(EMPTY_DRAFT, { name: "Referral ask", subject: "A quick favor", body: "Hi {{firstName}}", audience_key: "borrowers_closed", funnel: "partner" }, labels, now);
    expect(r.draft).toMatchObject({ name: "Referral ask", audienceKey: "borrowers_closed", funnel: "partner" });
    expect(r.changes).toEqual(expect.arrayContaining(["Audience: Closed borrowers", "Drafted the email"]));
  });
  it("ignores an audience or funnel that doesn't exist, and says so", () => {
    const r = applyDraftUpdate(EMPTY_DRAFT, { audience_key: "made_up", funnel: "tiktok" }, labels, now);
    expect(r.draft.audienceKey).toBe("all");
    expect(r.draft.funnel).toBeNull();
    expect(r.problems).toHaveLength(2);
  });
  it("builds a weekly repeat from the AI's words", () => {
    const s = scheduleFromAi({ mode: "repeat", repeat_every: "week", weekday: "Friday", time: "08:30" }, "2026-10-29");
    expect(s).toMatchObject({ mode: "repeat", every: "week", weekday: 5, hour: 8, minute: 30, startDate: "2026-10-30" });
    expect(scheduleFromAi({ mode: "repeat", repeat_every: "week" }, "2026-10-29")).toBeNull();
    expect(scheduleFromAi({ mode: "now" }, "2026-10-29")).toEqual({ mode: "once", now: true });
  });
});
