import { describe, expect, it } from "vitest";
import {
  describeOwned,
  hasExperienceToConfirm,
  monthsOwned,
  needsExperienceConfirmation,
  parseMonthInput,
  ownedSentence,
  rentalSummary,
  toMonthInput,
} from "../borrower-experience";

describe("confirmation", () => {
  it("only asks when flips or new construction are above zero", () => {
    expect(hasExperienceToConfirm({ numFlips: 0, numNewConstruction: 0 })).toBe(false);
    expect(hasExperienceToConfirm({ numFlips: null, numNewConstruction: null })).toBe(false);
    expect(hasExperienceToConfirm({ numFlips: 2, numNewConstruction: 0 })).toBe(true);
    expect(hasExperienceToConfirm({ numFlips: 0, numNewConstruction: 1 })).toBe(true);
  });
  it("is satisfied by a confirmation, and not needed at all with nothing entered", () => {
    expect(needsExperienceConfirmation({ numFlips: 2, numNewConstruction: 0, confirmed: false })).toBe(true);
    expect(needsExperienceConfirmation({ numFlips: 2, numNewConstruction: 0, confirmed: true })).toBe(false);
    expect(needsExperienceConfirmation({ numFlips: 0, numNewConstruction: 0, confirmed: false })).toBe(false);
  });
});

describe("month input", () => {
  it("round-trips a month and rejects anything else", () => {
    const d = parseMonthInput("2026-03");
    expect(d?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(toMonthInput(d)).toBe("2026-03");
    expect(parseMonthInput("2026-13")).toBeNull();
    expect(parseMonthInput("2026-3")).toBeNull();
    expect(parseMonthInput("")).toBeNull();
    expect(parseMonthInput(null)).toBeNull();
    expect(toMonthInput(null)).toBe("");
  });
});

describe("how long owned", () => {
  const now = new Date(2026, 10, 19); // Nov 19, 2026
  it("counts calendar months, negative for the future", () => {
    expect(monthsOwned(parseMonthInput("2026-03")!, now)).toBe(8);
    expect(monthsOwned(parseMonthInput("2026-11")!, now)).toBe(0);
    expect(monthsOwned(parseMonthInput("2026-12")!, now)).toBe(-1);
  });
  it("words it plainly", () => {
    expect(describeOwned(0)).toBe("under a month");
    expect(describeOwned(1)).toBe("1 month");
    expect(describeOwned(8)).toBe("8 months");
    expect(describeOwned(23)).toBe("23 months");
    expect(describeOwned(24)).toBe("2 years");
    expect(describeOwned(40)).toBe("3 years");
  });
  it("says it to the borrower", () => {
    expect(ownedSentence(12)).toBe("You have owned it about 12 months.");
    expect(ownedSentence(0)).toBe("You have owned it less than a month.");
    expect(ownedSentence(30)).toBe("You have owned it about 2 years.");
    expect(ownedSentence(-1)).toBe("That date is in the future. Check the month and year.");
  });
  it("summarizes a single rental with its date, and other counts plainly", () => {
    const since = parseMonthInput("2026-03");
    expect(rentalSummary(1, since, now)).toBe("1 rental, owned since Mar 2026 (8 months)");
    expect(rentalSummary(1, null, now)).toBe("1 rental");
    expect(rentalSummary(3, since, now)).toBe("3 rentals");
    expect(rentalSummary(null, null, now)).toBe("not provided");
  });
});
