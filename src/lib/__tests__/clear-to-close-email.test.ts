import { describe, expect, it } from "vitest";
import { buildTitleContactBlock, clearToCloseEmailPending } from "../clear-to-close-email";

const none = { titleCompanyName: null, titleCompanyAgentName: null, titleAgentPhone: null, titleAgentEmail: null };

describe("buildTitleContactBlock", () => {
  it("lists only the title details on file", () => {
    const html = buildTitleContactBlock({ ...none, titleCompanyAgentName: "Jamie Rivera", titleAgentPhone: "(904) 555-0142" });
    expect(html).toContain("Jamie Rivera");
    expect(html).toContain("(904) 555-0142");
    expect(html).not.toContain("Not provided");
    expect(html).not.toContain(">Email<");
    expect(html).not.toContain(">Title company<");
  });

  it("reads naturally when there's no title contact at all", () => {
    const html = buildTitleContactBlock({ ...none, titleCompanyAgentName: "  " });
    expect(html).toContain("reaching out to you shortly");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("contact them directly");
  });

  it("escapes what it's given", () => {
    const html = buildTitleContactBlock({ ...none, titleCompanyName: "A & B <Title>" });
    expect(html).toContain("A &amp; B &lt;Title&gt;");
  });
});

describe("clearToCloseEmailPending", () => {
  const base = { stage: "clear_to_close", borrowerEmail: "a@b.com", clearToCloseEmailStatus: null };
  it("is pending only at Clear to Close, unanswered, with an email", () => {
    expect(clearToCloseEmailPending(base)).toBe(true);
    expect(clearToCloseEmailPending({ ...base, stage: "closed" })).toBe(false);
    expect(clearToCloseEmailPending({ ...base, clearToCloseEmailStatus: "sent" })).toBe(false);
    expect(clearToCloseEmailPending({ ...base, clearToCloseEmailStatus: "declined" })).toBe(false);
    expect(clearToCloseEmailPending({ ...base, borrowerEmail: " " })).toBe(false);
  });
});
