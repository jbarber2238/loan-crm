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

import { buildEmbedSnippet } from "@/lib/embed-snippet";

describe("embed snippet", () => {
  const snippet = buildEmbedSnippet("https://mannalendingco.com/embed/intake/abc?aff=xyz");

  it("frames the form, centered, with a sensible starting height", () => {
    expect(snippet).toContain('src="https://mannalendingco.com/embed/intake/abc?aff=xyz"');
    expect(snippet).toContain("margin:0 auto");
    expect(snippet).toContain("height:700px");
  });

  it("includes the resize listener that only trusts its own frame", () => {
    expect(snippet).toContain("<script>");
    expect(snippet).toContain("e.source===f.contentWindow");
    expect(snippet).toContain("manna-embed-height");
  });
});

import { visibleGroups } from "@/components/settings/settings-nav";

describe("settings menu", () => {
  it("shows an admin every page, in groups", () => {
    const groups = visibleGroups(true);
    expect(groups.map((g) => g.title)).toEqual(["Account", "Company", "Communication", "Programs", "System"]);
    expect(groups.flatMap((g) => g.items).map((i) => i.href)).toEqual([
      "/settings", "/settings/company", "/settings/licensing", "/settings/team", "/settings/phone",
      "/settings/email-templates", "/settings/referrals", "/settings/reviews", "/settings/integrations", "/settings/deleted-deals",
    ]);
  });

  it("shows everyone else only their own profile", () => {
    const items = visibleGroups(false).flatMap((g) => g.items);
    expect(items.map((i) => i.href)).toEqual(["/settings"]);
  });
});
