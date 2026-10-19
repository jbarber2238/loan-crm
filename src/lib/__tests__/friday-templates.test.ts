import { describe, expect, it } from "vitest";
import { FRIDAY_TEMPLATE_DEFAULTS } from "@/server/friday-template-defaults";
import { FRIDAY_ZOOM_TOKENS } from "@/lib/email-template-tokens";
import { plainTextToHtmlWithBlocks } from "@/lib/email-html";

describe("Friday email templates", () => {
  it("only use merge fields the editor offers", () => {
    const known = new Set(FRIDAY_ZOOM_TOKENS.map((t) => t.key));
    for (const t of FRIDAY_TEMPLATE_DEFAULTS) {
      for (const [, key] of `${t.subject}\n${t.body}`.matchAll(/\{\{(\w+)\}\}/g)) expect(known.has(key), `${t.key}: {{${key}}}`).toBe(true);
    }
  });

  it("keep every link a button, never a bare URL", () => {
    for (const t of FRIDAY_TEMPLATE_DEFAULTS) expect(t.body).not.toMatch(/https?:\/\//);
  });

  it("never invite people to text or send deals outside the link", () => {
    for (const t of FRIDAY_TEMPLATE_DEFAULTS) {
      expect(t.body).not.toMatch(/text me|269-267-7506|send me a deal/i);
    }
  });

  it("turn a row of buttons into one block without stray blank lines", () => {
    const html = plainTextToHtmlWithBlocks("Hi\n\n{{row}}\n\nBye", { row: '<div style="margin:12px 0 4px;"><a>One</a></div>' });
    expect(html).toContain('Hi<div style="margin:12px 0 4px;"><a>One</a></div>Bye');
  });
});
