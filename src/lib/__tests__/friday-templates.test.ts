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

import { PARTNER_INVITE_TEMPLATE_DEFAULTS } from "@/server/partner-invite-template-defaults";
import { PARTNER_INVITE_TOKENS } from "@/lib/email-template-tokens";

describe("Partner invite templates", () => {
  it("only use merge fields the editor offers", () => {
    const known = new Set(PARTNER_INVITE_TOKENS.map((t) => t.key));
    for (const t of PARTNER_INVITE_TEMPLATE_DEFAULTS) {
      for (const [, key] of `${t.subject}\n${t.body}`.matchAll(/\{\{(\w+)\}\}/g)) expect(known.has(key), `${t.key}: {{${key}}}`).toBe(true);
    }
  });

  it("every email carries the setup button on its own line, and no bare links", () => {
    for (const t of PARTNER_INVITE_TEMPLATE_DEFAULTS) {
      expect(t.body.split("\n")).toContain("{{setupButton}}");
      expect(t.body).not.toMatch(/https?:\/\//);
    }
  });

  it("covers every step the cadence can ask for", () => {
    const keys = PARTNER_INVITE_TEMPLATE_DEFAULTS.map((t) => t.key);
    for (const k of ["partner_invite_initial", "partner_invite_reminder_first", "partner_invite_reminder_second", "partner_invite_reminder_third", "partner_invite_reminder_final"]) {
      expect(keys).toContain(k);
    }
  });
});
