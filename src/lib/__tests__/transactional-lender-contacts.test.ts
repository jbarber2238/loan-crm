import { describe, expect, it } from "vitest";
import { lenderEmailRecipients, parseAdditionalContacts } from "@/lib/transactional-lender-contacts";

describe("lenderEmailRecipients", () => {
  it("puts the main contact first, then the additional contacts", () => {
    expect(
      lenderEmailRecipients("main@lender.com", [
        { name: "Sam", phone: null, email: "sam@lender.com" },
        { name: "Pat", phone: "555", email: "pat@lender.com" },
      ])
    ).toEqual(["main@lender.com", "sam@lender.com", "pat@lender.com"]);
  });

  it("drops duplicates (ignoring case) and blanks", () => {
    expect(
      lenderEmailRecipients("Main@Lender.com", [{ name: "Dup", phone: null, email: "main@lender.com" }])
    ).toEqual(["Main@Lender.com"]);
    expect(lenderEmailRecipients(null, [{ name: "A", phone: null, email: "a@x.com" }])).toEqual(["a@x.com"]);
    expect(lenderEmailRecipients(null, [])).toEqual([]);
  });
});

describe("parseAdditionalContacts", () => {
  it("reads contacts and ignores blank rows", () => {
    const contacts = parseAdditionalContacts(
      JSON.stringify([
        { name: " Sam ", phone: " 555-0100 ", email: "sam@lender.com" },
        { name: "", phone: "", email: "" },
      ])
    );
    expect(contacts).toEqual([{ name: "Sam", phone: "555-0100", email: "sam@lender.com" }]);
  });

  it("requires a valid email on every filled-in contact", () => {
    expect(() => parseAdditionalContacts(JSON.stringify([{ name: "Sam", phone: "555", email: "" }]))).toThrow(/valid email/);
    expect(() => parseAdditionalContacts(JSON.stringify([{ name: "Sam", email: "nope" }]))).toThrow(/valid email/);
  });

  it("treats empty input as no contacts", () => {
    expect(parseAdditionalContacts("")).toEqual([]);
    expect(parseAdditionalContacts(null)).toEqual([]);
  });
});
