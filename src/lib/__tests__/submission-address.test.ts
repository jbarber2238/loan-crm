import { describe, expect, it } from "vitest";
import { ensureAddressInHtml, ensureAddressInSubject, ensureAddressInText } from "../submission-address";

const ADDRESS = "15373 Birdhouse Road, Andalusia, Alabama 36421";

describe("ensureAddressInSubject", () => {
  it("adds the address to a subject that doesn't have it", () => {
    expect(ensureAddressInSubject("New Loan Submission", ADDRESS)).toBe(`New Loan Submission — ${ADDRESS}`);
  });
  it("leaves a subject that already has it (any case or spacing)", () => {
    expect(ensureAddressInSubject(`${ADDRESS} — Loan Submission`, ADDRESS)).toBe(`${ADDRESS} — Loan Submission`);
    expect(ensureAddressInSubject(ADDRESS.toUpperCase().replace(", ", ",  "), ADDRESS)).toBe(ADDRESS.toUpperCase().replace(", ", ",  "));
  });
  it("uses the address alone for an empty subject", () => {
    expect(ensureAddressInSubject("  ", ADDRESS)).toBe(ADDRESS);
  });
});

describe("ensureAddressInText", () => {
  it("puts a Property line after the greeting", () => {
    expect(ensureAddressInText("Hi Chris,\n\nPlease find our submission below.", ADDRESS)).toBe(
      `Hi Chris,\n\nProperty: ${ADDRESS}\n\nPlease find our submission below.`
    );
  });
  it("handles a body with no paragraph break", () => {
    expect(ensureAddressInText("Hello", ADDRESS)).toBe(`Property: ${ADDRESS}\n\nHello`);
  });
  it("leaves a body that already has it", () => {
    const body = `Hi Chris,\n\nSubmitting ${ADDRESS} today.`;
    expect(ensureAddressInText(body, ADDRESS)).toBe(body);
  });
});

describe("ensureAddressInHtml", () => {
  it("adds a Property paragraph at the top when missing", () => {
    expect(ensureAddressInHtml("<p>Hi Chris,</p>", ADDRESS)).toBe(`<p><strong>Property:</strong> ${ADDRESS}</p><p>Hi Chris,</p>`);
  });
  it("sees the address through tags and entities", () => {
    const html = "<p>Submitting <b>15373 Birdhouse Road,</b> Andalusia, Alabama 36421</p>";
    expect(ensureAddressInHtml(html, ADDRESS)).toBe(html);
    expect(ensureAddressInHtml("<p>1 A &amp; B St</p>", "1 A & B St")).toBe("<p>1 A &amp; B St</p>");
  });
  it("escapes the address it adds", () => {
    expect(ensureAddressInHtml("<p>Hi</p>", "1 A & B St")).toContain("1 A &amp; B St");
  });
});
