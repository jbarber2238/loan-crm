// How a marketing campaign email is put together: merge fields, buttons and the finished HTML. Pure.

import { htmlButton, plainTextToHtmlWithBlocks } from "@/lib/email-html";
import { APPLY_URL } from "@/lib/lead-constants";

/** Links an email can carry as a button. Put the token on its own line: {{fridayButton}}. Clicks on these are counted. */
export const CAMPAIGN_BUTTONS: Record<string, { label: string; path: string; description: string }> = {
  fridayButton: { label: "Save my seat for Friday", path: "https://mannalendingco.com/friday", description: "Registration page for the Friday Zoom, See It, Send It, Get Paid" },
  applyButton: { label: "Start my application", path: APPLY_URL, description: "The loan application" },
  partnerButton: { label: "Become a partner", path: "https://mannalendingco.com/become-a-partner", description: "Referral partner sign-up" },
  maxOfferButton: { label: "Open the Max Offer calculator", path: "https://mannalendingco.com/resources/max-allowable-offer-calculator", description: "Max Allowable Offer calculator" },
  dscrCalculatorButton: { label: "Open the DSCR calculator", path: "https://mannalendingco.com/resources/dscr-calculator", description: "DSCR calculator" },
  hardMoneyButton: { label: "Open the hard money calculator", path: "https://mannalendingco.com/resources/hard-money-calculator", description: "Hard money calculator" },
};

export const CAMPAIGN_MERGE_FIELDS = [
  { key: "firstName", description: "The person's first name (\"there\" when we don't have one)" },
  { key: "name", description: "The person's full name" },
];

export const FUNNELS = [
  { value: "friday_zoom", label: "Friday Zoom", buttonKey: "fridayButton" },
  { value: "calculator", label: "Calculators", buttonKey: "maxOfferButton" },
  { value: "partner", label: "Partner program", buttonKey: "partnerButton" },
  { value: "apply", label: "Loan application", buttonKey: "applyButton" },
] as const;

export function funnelLabel(value: string | null): string {
  return FUNNELS.find((f) => f.value === value)?.label ?? "None";
}

export function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] || "there";
}

const BUTTON_LINE = /^\{\{(\w+Button)\}\}$/;

function fillTokens(text: string, tokens: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => tokens[key] ?? match);
}

/** Names used as {{tokens}} in the text that aren't a merge field or a known button: the writer made them up. */
export function unknownTokens(text: string): string[] {
  const known = new Set([...CAMPAIGN_MERGE_FIELDS.map((f) => f.key), ...Object.keys(CAMPAIGN_BUTTONS)]);
  return [...new Set([...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))].filter((k) => !known.has(k));
}

/**
 * Subject and HTML for one recipient. `linkFor` turns a button key into the address it points at (a click-counting link
 * in real sends, the plain page in a preview). Buttons on consecutive lines sit side by side.
 */
export function renderCampaign(input: { subject: string; body: string; name: string }, linkFor: (buttonKey: string) => string): { subject: string; html: string } {
  const tokens = { firstName: firstNameOf(input.name), name: input.name.trim() || "there" };
  const blocks: Record<string, string> = {};
  const lines: string[] = [];
  let run: string[] = [];
  let rows = 0;
  const flush = () => {
    if (!run.length) return;
    const key = `buttonRow${rows++}`;
    blocks[key] = `<div style="margin:12px 0 4px;">${run.map((k) => `<span style="display:inline-block; margin:0 8px 8px 0;">${htmlButton(CAMPAIGN_BUTTONS[k].label, linkFor(k))}</span>`).join("")}</div>`;
    lines.push(`{{${key}}}`);
    run = [];
  };
  for (const line of input.body.split("\n")) {
    const match = line.trim().match(BUTTON_LINE);
    if (match && CAMPAIGN_BUTTONS[match[1]]) run.push(match[1]);
    else {
      flush();
      lines.push(line);
    }
  }
  flush();
  return {
    subject: fillTokens(input.subject, tokens),
    html: plainTextToHtmlWithBlocks(fillTokens(lines.join("\n"), tokens), blocks),
  };
}

const clip = (s: string) => s.slice(0, 40).trim();

/** The tags a campaign leaves on people: one on everyone it's sent to, one on whoever clicks a button in it. */
export function campaignTags(name: string, tagRecipients: string | null): { sent: string; clicked: string } {
  const base = (tagRecipients?.trim() || `campaign: ${name.trim()}`).toLowerCase().replace(/\s+/g, " ");
  const rest = base.replace(/^(campaign|clicked|responded):\s*/, "");
  return { sent: clip(base.startsWith("campaign:") ? base : `campaign: ${base}`), clicked: clip(`clicked: ${rest}`) };
}
