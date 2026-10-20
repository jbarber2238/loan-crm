import { describe, expect, it } from "vitest";
import { stateFromAddress } from "@/lib/us-states";
import { describeBroker, licenseFlagFor } from "@/lib/license-flag";

describe("stateFromAddress", () => {
  it("reads the state however it was typed", () => {
    expect(stateFromAddress("100 Example Ave, Detroit, MI 48201")).toBe("MI");
    expect(stateFromAddress("TEST 1813 Hawthorne Ave. Saint Joseph, Mi. 49085")).toBe("MI");
    expect(stateFromAddress("657 E LAPORTE DR, PUEBLO WEST, CO 81007")).toBe("CO");
    expect(stateFromAddress("12 Main St, Austin, TX 78701-1234")).toBe("TX");
    expect(stateFromAddress("12 Main St, Austin, Texas 78701")).toBe("TX");
    expect(stateFromAddress("12 Main St, Portland, oregon")).toBe("OR");
  });

  it("returns null when there's no state", () => {
    expect(stateFromAddress("Portfolio (3 properties)")).toBeNull();
    expect(stateFromAddress("")).toBeNull();
    expect(stateFromAddress("12 Main St, Springfield, ZZ 12345")).toBeNull();
  });

  it("doesn't mistake a street or city for a state", () => {
    expect(stateFromAddress("1 In St, Me")).toBe("ME"); // a real state code at the end still counts
    expect(stateFromAddress("500 Oak Ln, Anytown, 12345")).toBeNull();
    expect(stateFromAddress("12 Elm Ct")).toBeNull(); // "Ct" the street suffix, not Connecticut
  });
});

describe("licenseFlagFor", () => {
  const broker = { name: "Jeremy Altervain", company: "Vault", phone: "310-890-4896", email: null, notes: null };
  const required = new Set(["CA", "NV"]);

  it("flags a property in a state that needs a license", () => {
    const flag = licenseFlagFor("5 Beach Rd, San Diego, CA 92101", required, broker);
    expect(flag).toMatchObject({ stateCode: "CA", stateName: "California" });
    expect(flag?.broker?.company).toBe("Vault");
  });

  it("ignores every other state, and addresses with no state", () => {
    expect(licenseFlagFor("5 Main St, Detroit, MI 48201", required, broker)).toBeNull();
    expect(licenseFlagFor("Portfolio", required, broker)).toBeNull();
  });

  it("still flags when no broker is set up yet", () => {
    expect(licenseFlagFor("5 Beach Rd, San Diego, CA 92101", required, null)?.broker).toBeNull();
  });

  it("describes the broker with whatever details exist", () => {
    expect(describeBroker(broker)).toBe("Jeremy Altervain · Vault · 310-890-4896");
    expect(describeBroker(null)).toContain("Settings → Licensing");
  });
});
