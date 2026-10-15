import { describe, expect, it } from "vitest";
import { borrowerLabel, cityFrom } from "@/lib/partner-display";

describe("what a partner sees about a borrower", () => {
  it("shows first name and last initial only", () => {
    expect(borrowerLabel("Michael Venticinque")).toBe("Michael V.");
    expect(borrowerLabel("Cher")).toBe("Cher");
    expect(borrowerLabel("Mary Ann van der Berg")).toBe("Mary B.");
  });

  it("shows the city, not the street", () => {
    expect(cityFrom("29469 Oakey Streak Rd, Andalusia, AL 36421")).toBe("Andalusia");
    expect(cityFrom("657 E LAPORTE DR, PUEBLO WEST, CO 81007")).toBe("PUEBLO WEST");
    expect(cityFrom("Portfolio (3 properties)")).toBe("—");
  });
});
