import { describe, expect, it, vi } from "vitest";
import { intakeToDealFields, parseIntakeFormData } from "@/server/actions/parse-intake";

// Phone formatting pulls in the Twilio client (and a database connection); these tests only look at experience fields.
vi.mock("@/server/twilio-client", () => ({ toE164: (v: string) => v }));

function form(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

describe("borrower experience on intake", () => {
  it("stamps the confirmation only when flips or new construction were entered and confirmed", () => {
    const confirmed = intakeToDealFields(parseIntakeFormData(form({ numFlips: "2", numRentals: "0", numNewConstruction: "0", experienceConfirmed: "yes" })));
    expect(confirmed.experienceConfirmedAt).toBeInstanceOf(Date);
    const unconfirmed = intakeToDealFields(parseIntakeFormData(form({ numFlips: "2", numRentals: "0", numNewConstruction: "0" })));
    expect(unconfirmed.experienceConfirmedAt).toBeNull();
    const nothingToConfirm = intakeToDealFields(parseIntakeFormData(form({ numFlips: "0", numRentals: "3", numNewConstruction: "0", experienceConfirmed: "yes" })));
    expect(nothingToConfirm.experienceConfirmedAt).toBeNull();
  });

  it("keeps the rental purchase month only with exactly one rental", () => {
    const one = intakeToDealFields(parseIntakeFormData(form({ numFlips: "0", numRentals: "1", numNewConstruction: "0", singleRentalPurchaseDate: "2026-03" })));
    expect(one.singleRentalPurchaseDate?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    const two = intakeToDealFields(parseIntakeFormData(form({ numFlips: "0", numRentals: "2", numNewConstruction: "0", singleRentalPurchaseDate: "2026-03" })));
    expect(two.singleRentalPurchaseDate).toBeNull();
    const garbage = intakeToDealFields(parseIntakeFormData(form({ numFlips: "0", numRentals: "1", numNewConstruction: "0", singleRentalPurchaseDate: "March" })));
    expect(garbage.singleRentalPurchaseDate).toBeNull();
  });
});
