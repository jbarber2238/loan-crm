import { describe, expect, it } from "vitest";
import { safeText, scrubSensitive } from "../redact";

describe("scrubSensitive", () => {
  it.each([
    ["SSN with dashes", "SSN is 123-45-6789 ok", "123-45-6789"],
    ["SSN with spaces", "ssn 123 45 6789", "123 45 6789"],
    ["SSN as 9 digits", "social 123456789", "123456789"],
    ["account number", "acct 000123456789 at Chase", "000123456789"],
    ["routing number", "routing 021000021", "021000021"],
    ["card number in groups", "card 4111 1111 1111 1111", "4111 1111 1111 1111"],
    ["date of birth", "DOB: 04/12/1984", "04/12/1984"],
    ["date of birth, ISO", "born on 1984-04-12", "1984-04-12"],
    ["date of birth, spelled out", "Date of Birth 4-12-84", "4-12-84"],
  ])("removes %s", (_label, input, secret) => {
    const out = scrubSensitive(input);
    expect(out).not.toContain(secret);
    expect(out).toContain("[redacted]");
  });

  it("leaves ordinary text, dollar amounts and loan numbers alone", () => {
    const text = "Loan 1042 for $1,250,000 closing 11/15/2026 at 123 Main St";
    expect(scrubSensitive(text)).toBe(text);
  });
});

describe("safeText", () => {
  it("flattens whitespace, caps length and passes null through", () => {
    expect(safeText("a\n\n  b")).toBe("a b");
    expect(safeText("x".repeat(50), 10)).toBe("xxxxxxxxx…");
    expect(safeText(null)).toBeNull();
    expect(safeText("   ")).toBeNull();
  });
});
