import { describe, expect, it } from "vitest";
import { loanOfficerCalendarPhrase, senderIntroLine } from "@/lib/borrower-sender-lines";
import { plainTextToHtmlWithBlocks } from "@/lib/email-html";

const base = { senderName: "Justin Barber", loanOfficerName: "Justin Barber", companyName: "Manna Lending" };

describe("sender-aware borrower email lines", () => {
  it("a loan officer sender never says they work alongside themselves", () => {
    expect(senderIntroLine({ ...base, senderRole: "loan_officer" })).toBe(
      "My name is Justin Barber, your loan officer here at Manna Lending."
    );
    expect(loanOfficerCalendarPhrase({ loanOfficerName: "Justin Barber", senderRole: "loan_officer" })).toBe("my calendar");
  });

  it("an assistant says who they work alongside and points to the loan officer's calendar", () => {
    const sender = { ...base, senderName: "Sam Lee", senderRole: "loan_officer_assistant" as const };
    expect(senderIntroLine(sender)).toBe(
      "My name is Sam Lee, and I'm working alongside Justin Barber, your loan officer here at Manna Lending."
    );
    expect(loanOfficerCalendarPhrase({ loanOfficerName: "Justin Barber", senderRole: "loan_officer_assistant" })).toBe("Justin Barber's calendar");
  });

  it("falls back to the loan officer wording when no loan officer is assigned", () => {
    expect(senderIntroLine({ ...base, loanOfficerName: "", senderRole: "loan_officer_assistant" })).toBe(
      "My name is Justin Barber, your loan officer here at Manna Lending."
    );
  });
});

describe("plainTextToHtmlWithBlocks list spacing", () => {
  it("drops the blank lines around a list so its margins set the gap", () => {
    const html = plainTextToHtmlWithBlocks("Here's a breakdown:\n{{facts}}\n\nNext paragraph.", { facts: "<ul><li>One</li></ul>" });
    expect(html).toContain('breakdown:<div style="margin:4px 0;"><ul><li>One</li></ul></div>Next paragraph.');
  });

  it("leaves non-list blocks (buttons) exactly as before", () => {
    const html = plainTextToHtmlWithBlocks("Below:\n{{links}}\n\nThanks.", { links: "<a>Go</a>" });
    expect(html).toContain("Below:\n<a>Go</a>\n\nThanks.");
  });
});
