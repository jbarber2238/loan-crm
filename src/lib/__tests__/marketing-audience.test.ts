import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
  allTags,
  applyFilters,
  countBy,
  deriveTags,
  describeFilters,
  isEligible,
  normalizeTag,
  type AudienceFilters,
  type AudiencePerson,
} from "@/lib/marketing-audience";

const person = (over: Partial<AudiencePerson> = {}): AudiencePerson => ({
  id: "1",
  name: "Terry Geier",
  email: "terry@example.com",
  phone: "555",
  source: "friday_zoom",
  role: "Investor",
  status: "new",
  fridayStatus: "registered",
  fridayEmailOnly: false,
  monthlyList: false,
  usedCalculator: false,
  downloadedExcel: false,
  becameDeal: false,
  partner: null,
  joinedAt: "2026-10-20T14:00:00.000Z",
  manualTags: [],
  ...over,
});
const f = (over: Partial<AudienceFilters>): AudienceFilters => ({ ...EMPTY_FILTERS, ...over });

describe("isEligible", () => {
  it("needs recorded consent, no unsubscribe and an email", () => {
    expect(isEligible({ marketingConsent: true, unsubscribedAt: null, email: "a@b.com" })).toBe(true);
    expect(isEligible({ marketingConsent: false, unsubscribedAt: null, email: "a@b.com" })).toBe(false);
    expect(isEligible({ marketingConsent: true, unsubscribedAt: new Date(), email: "a@b.com" })).toBe(false);
    expect(isEligible({ marketingConsent: true, unsubscribedAt: null, email: " " })).toBe(false);
  });
});

describe("tags", () => {
  it("are worked out from what we know, and manual tags are added after", () => {
    const p = person({ fridayStatus: "attended", partner: "signed", usedCalculator: true, manualTags: ["webinar-oct-30"] });
    const tags = allTags(p);
    expect(tags).toContain("Funnel: Friday Zoom");
    expect(tags).toContain("Role: Investor");
    expect(tags).toContain("Friday: Attended");
    expect(tags).toContain("Partner: Signed");
    expect(tags).toContain("Used calculator");
    expect(tags[tags.length - 1]).toBe("webinar-oct-30");
    expect(deriveTags(p)).not.toContain("webinar-oct-30");
  });
  it("only tag what's true", () => {
    expect(deriveTags(person({ role: null, fridayStatus: null }))).toEqual(["Funnel: Friday Zoom", "Lead: New"]);
  });
});

describe("filters", () => {
  const people = [
    person({ id: "a", name: "Ann", email: "ann@x.com", fridayStatus: "attended", partner: "signed" }),
    person({ id: "b", name: "Bob", email: "bob@x.com", fridayStatus: "no_show", role: "Builder", joinedAt: "2026-09-01T00:00:00.000Z" }),
    person({ id: "c", name: "Cy", email: "cy@y.com", source: "max_allowable_offer_calculator", fridayStatus: null, role: null, status: "hot", usedCalculator: true, becameDeal: true }),
  ];
  const ids = (x: AudiencePerson[]) => x.map((p) => p.id);

  it("no filters means everyone", () => expect(ids(applyFilters(people, EMPTY_FILTERS))).toEqual(["a", "b", "c"]));
  it("any choice within a group matches", () => expect(ids(applyFilters(people, f({ friday: ["attended", "no_show"] })))).toEqual(["a", "b"]));
  it("every group has to match", () => expect(ids(applyFilters(people, f({ friday: ["attended", "no_show"], roles: ["Builder"] })))).toEqual(["b"]));
  it("filters by funnel", () => expect(ids(applyFilters(people, f({ sources: ["max_allowable_offer_calculator"] })))).toEqual(["c"]));
  it("filters partners and deals", () => {
    expect(ids(applyFilters(people, f({ partner: "signed" })))).toEqual(["a"]);
    expect(ids(applyFilters(people, f({ partner: "not_signed" })))).toEqual(["b", "c"]);
    expect(ids(applyFilters(people, f({ becameDeal: "yes" })))).toEqual(["c"]);
    expect(ids(applyFilters(people, f({ becameDeal: "no" })))).toEqual(["a", "b"]);
  });
  it("filters by tag, derived or manual, ignoring case", () => {
    const tagged = [...people.slice(0, 2), person({ id: "d", manualTags: ["oct webinar"] })];
    expect(ids(applyFilters(tagged, f({ tags: ["Oct Webinar"] })))).toEqual(["d"]);
    expect(ids(applyFilters(tagged, f({ tags: ["friday: no-show"] })))).toEqual(["b"]);
  });
  it("filters by join date, inclusive", () => {
    expect(ids(applyFilters(people, f({ joinedFrom: "2026-10-01" })))).toEqual(["a", "c"]);
    expect(ids(applyFilters(people, f({ joinedTo: "2026-09-01" })))).toEqual(["b"]);
  });
  it("searches name and email", () => {
    expect(ids(applyFilters(people, f({ search: "y.com" })))).toEqual(["c"]);
    expect(ids(applyFilters(people, f({ search: " ANN " })))).toEqual(["a"]);
  });
});

describe("normalizeTag", () => {
  it("cleans up tags typed by hand", () => {
    expect(normalizeTag("  Webinar  Oct-30 ")).toBe("webinar oct-30");
    expect(normalizeTag("a")).toBeNull();
    expect(normalizeTag("<script>")).toBeNull();
    expect(normalizeTag("x".repeat(41))).toBeNull();
  });
});

describe("describeFilters and countBy", () => {
  it("summarizes a saved audience in words", () => {
    expect(describeFilters(EMPTY_FILTERS)).toBe("Everyone eligible");
    expect(describeFilters(f({ sources: ["friday_zoom"], friday: ["attended"], partner: "not_signed" }))).toBe("Friday Zoom · Friday attended · not signed partners");
  });
  it("counts values most common first", () => {
    const out = countBy([person({ role: "A" }), person({ role: "B" }), person({ role: "B" }), person({ role: null })], (p) => p.role);
    expect(out).toEqual([{ value: "B", count: 2 }, { value: "A", count: 1 }]);
  });
});
