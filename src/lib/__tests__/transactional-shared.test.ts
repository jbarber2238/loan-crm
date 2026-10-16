import { describe, expect, it } from "vitest";
import { buildLenderEmailHtml } from "@/lib/transactional-shared";

const input = {
  lenderName: "Acme Funding",
  closingDate: new Date(Date.UTC(2026, 9, 20)),
  borrowerName: "Pat Wholesaler",
  borrowerPhone: "555-0100",
  borrowerEmail: "pat@example.com",
  fundingAmount: 300000,
  titleCompanyName: "Sunrise Title",
  titleAgentName: "Dana Agent",
  titlePhone: "555-0199",
  titleEmail: "dana@sunrise.example",
};

describe("buildLenderEmailHtml", () => {
  it("makes every detail a bullet with a bold name and a regular-weight value", () => {
    const html = buildLenderEmailHtml(input);
    for (const [label, value] of [
      ["Borrower Name", "Pat Wholesaler"],
      ["Borrower Phone", "555-0100"],
      ["Borrower Email", "pat@example.com"],
      ["Funding Amount", "$300,000"],
      ["Title Company Name", "Sunrise Title"],
      ["Title Agent Name", "Dana Agent"],
      ["Title Phone", "555-0199"],
      ["Title Email", "dana@sunrise.example"],
    ]) {
      expect(html).toMatch(new RegExp(`<li[^>]*><strong>${label}:</strong> ${value.replace("$", "\\$")}</li>`));
    }
    expect(html.match(/<li/g)).toHaveLength(8);
  });

  it("keeps the greeting, the funding date and the sign-off", () => {
    const html = buildLenderEmailHtml(input);
    expect(html).toContain("Hello Acme Funding,");
    expect(html).toContain("I have a double close that needs funding by October 20, 2026.");
    expect(html).toContain("Best Regards,");
  });

  it("escapes anything typed into the request so it can't become markup", () => {
    const html = buildLenderEmailHtml({ ...input, borrowerName: "Pat <b>& Co" });
    expect(html).toContain("Pat &lt;b&gt;&amp; Co");
    expect(html).not.toContain("<b>");
  });
});
