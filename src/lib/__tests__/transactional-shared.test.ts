import { describe, expect, it } from "vitest";
import { buildLenderEmailBody } from "@/lib/transactional-shared";

describe("buildLenderEmailBody", () => {
  it("matches the lender email template", () => {
    const body = buildLenderEmailBody({
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
    });
    expect(body).toBe(
      [
        "Hello Acme Funding,",
        "",
        "I have a double close that needs funding by October 20, 2026.",
        "",
        "Borrower Name: Pat Wholesaler",
        "Borrower Phone: 555-0100",
        "Borrower Email: pat@example.com",
        "",
        "Funding Amount: $300,000",
        "",
        "Title Company Name: Sunrise Title",
        "Title Agent Name: Dana Agent",
        "Title Phone: 555-0199",
        "Title Email: dana@sunrise.example",
        "",
        "Best Regards,",
      ].join("\n")
    );
  });
});
