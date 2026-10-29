import { describe, expect, it } from "vitest";
import {
  allTags,
  audienceMembers,
  audienceOptions,
  consentState,
  deriveTags,
  isEmailable,
  normalizeTag,
  peopleToCsv,
  tagAudienceKey,
  type AudiencePerson,
} from "@/lib/marketing-audience";

const person = (over: Partial<AudiencePerson> = {}): AudiencePerson => ({
  key: "terry@example.com",
  name: "Terry Geier",
  email: "terry@example.com",
  phone: "555",
  consent: "agreed",
  consentNote: "Agreed on the Friday Zoom form",
  consentSource: null,
  contactId: null,
  isLead: false,
  source: null,
  role: null,
  leadStatus: null,
  fridayStatus: null,
  fridayEmailOnly: false,
  monthlyList: false,
  usedCalculator: false,
  downloadedExcel: false,
  becameDeal: false,
  closedDeals: 0,
  openDeals: 0,
  loanTypes: [],
  latestDealStage: null,
  partner: null,
  addedManually: false,
  joinedAt: "2026-10-20T14:00:00.000Z",
  manualTags: [],
  ...over,
});

describe("consentState", () => {
  const base = { leadConsent: false, leadUnsubscribed: false, contactConsent: false, contactUnsubscribed: false };
  it("agreed in either place counts", () => {
    expect(consentState({ ...base, leadConsent: true })).toBe("agreed");
    expect(consentState({ ...base, contactConsent: true })).toBe("agreed");
    expect(consentState(base)).toBe("not_agreed");
  });
  it("an opt-out anywhere wins over any agreement", () => {
    expect(consentState({ ...base, leadConsent: true, contactUnsubscribed: true })).toBe("unsubscribed");
    expect(consentState({ ...base, contactConsent: true, leadUnsubscribed: true })).toBe("unsubscribed");
  });
});

describe("isEmailable", () => {
  it("needs agreement and an address", () => {
    expect(isEmailable(person())).toBe(true);
    expect(isEmailable(person({ consent: "not_agreed" }))).toBe(false);
    expect(isEmailable(person({ consent: "unsubscribed" }))).toBe(false);
    expect(isEmailable(person({ email: " " }))).toBe(false);
  });
});

describe("tags", () => {
  it("tags a borrower who closed, with their loan type and latest stage", () => {
    const tags = deriveTags(person({ closedDeals: 2, openDeals: 1, loanTypes: ["fix_and_flip"], latestDealStage: "closed" }));
    expect(tags).toContain("Borrower: Closed");
    expect(tags).not.toContain("Borrower: Not closed yet");
    expect(tags).toContain("Loan: Fix and Flip");
    expect(tags).toContain("Deal stage: Closed");
  });
  it("tags a borrower who submitted but hasn't closed", () => {
    expect(deriveTags(person({ openDeals: 1, latestDealStage: "lost" }))).toEqual(expect.arrayContaining(["Borrower: Not closed yet", "Deal stage: Lost"]));
  });
  it("marks leads by funnel and people added by hand", () => {
    expect(deriveTags(person({ isLead: true, source: "friday_zoom", fridayStatus: "attended" }))).toEqual(expect.arrayContaining(["Funnel: Friday Zoom", "Friday: Attended"]));
    expect(deriveTags(person({ addedManually: true, consentSource: "follow_up" }))).toEqual(expect.arrayContaining(["Added by hand", "Agreed in a follow-up"]));
  });
  it("combines derived and manual tags", () => {
    expect(allTags(person({ manualTags: ["oct webinar"] }))).toContain("oct webinar");
  });
});

describe("audiences", () => {
  const closed = person({ key: "a@x.com", email: "a@x.com", closedDeals: 1 });
  const open = person({ key: "b@x.com", email: "b@x.com", openDeals: 2, consent: "not_agreed" });
  const friday = person({ key: "c@x.com", email: "c@x.com", isLead: true, source: "friday_zoom", fridayStatus: "attended", manualTags: ["oct webinar"] });
  const people = [closed, open, friday];

  it("splits borrowers into closed and not closed", () => {
    expect(audienceMembers("borrowers_closed", people)?.map((p) => p.key)).toEqual(["a@x.com"]);
    expect(audienceMembers("borrowers_open", people)?.map((p) => p.key)).toEqual(["b@x.com"]);
    expect(audienceMembers("borrowers_all", people)).toHaveLength(2);
  });
  it("resolves tag audiences, ignoring case", () => {
    expect(audienceMembers(tagAudienceKey("Oct Webinar"), people)?.map((p) => p.key)).toEqual(["c@x.com"]);
  });
  it("returns null for a list that doesn't exist", () => {
    expect(audienceMembers("nope", people)).toBeNull();
  });
  it("counts only people who agreed as reachable, and reports who hasn't", () => {
    const options = audienceOptions(people);
    const openOption = options.find((o) => o.key === "borrowers_open")!;
    expect(openOption.eligible).toBe(0);
    expect(openOption.notAgreed).toBe(1);
    expect(options.find((o) => o.key === "all")!.eligible).toBe(2);
    expect(options.some((o) => o.key === "tag:oct webinar")).toBe(true);
  });
});

describe("normalizeTag", () => {
  it("lower-cases and tidies, and rejects the unusable", () => {
    expect(normalizeTag("  Oct   Webinar ")).toBe("oct webinar");
    expect(normalizeTag("campaign: x")).toBe("campaign: x");
    expect(normalizeTag("a")).toBeNull();
    expect(normalizeTag("<script>")).toBeNull();
  });
});

describe("peopleToCsv", () => {
  it("quotes cells and defuses spreadsheet formulas", () => {
    const csv = peopleToCsv([person({ name: '=HYPERLINK("x")', phone: "1,2" })]);
    const row = csv.split("\r\n")[1];
    expect(row.startsWith(`"'=HYPERLINK(""x"")"`)).toBe(true);
    expect(row).toContain('"1,2"');
    expect(csv.split("\r\n")[0]).toBe("Name,Email,Phone,Marketing,Tags");
  });
});
