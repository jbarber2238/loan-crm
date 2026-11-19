import { describe, expect, it } from "vitest";
import { dedupePrograms, type ExtractedCriteria } from "@/server/ai/extract-lender-criteria";

function program(detectedCategory: string | null, over: Partial<ExtractedCriteria> = {}): ExtractedCriteria {
  return {
    minFico: null,
    minLoanAmount: null,
    maxLoanAmount: null,
    statesAllowed: null,
    propertyTypesAllowed: null,
    minDscr: null,
    maxLtv: null,
    maxLtc: null,
    maxLtarv: null,
    minExperienceCount: null,
    entityOnlyRequired: null,
    gcLicenseRequired: null,
    msaPopulationMinimum: null,
    foreignNationalEligible: null,
    itinEligible: null,
    ruralEligible: null,
    tiers: [],
    extractionNotes: null,
    detectedCategory,
    ...over,
  };
}

const tier = (notes: string) => ({ ficoMin: 650, ficoMax: null, experienceMin: 0, maxLtc: 75, maxLtarv: null, maxLtv: 75, notes });

describe("dedupePrograms", () => {
  it("keeps one entry per category, in the order they first appear", () => {
    const out = dedupePrograms([program("fix_and_flip"), program("new_construction"), program("dscr_purchase")]);
    expect(out.map((p) => p.detectedCategory)).toEqual(["fix_and_flip", "new_construction", "dscr_purchase"]);
  });

  it("merges a repeated category instead of letting the later entry overwrite the earlier one", () => {
    const out = dedupePrograms([
      program("bridge_purchase", { tiers: [tier("1-4 units")], extractionNotes: "SFR grid." }),
      program("bridge_purchase", { tiers: [tier("5+ units")], extractionNotes: "MF grid." }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].tiers.map((t) => t.notes)).toEqual(["1-4 units", "5+ units"]);
    expect(out[0].extractionNotes).toBe("SFR grid. MF grid.");
  });

  it("drops entries with no category", () => {
    expect(dedupePrograms([program(null), program("fix_and_flip")]).map((p) => p.detectedCategory)).toEqual(["fix_and_flip"]);
  });
});
