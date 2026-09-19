// Shared HTML-email building blocks. Not a "use server" module — plain
// helpers/constants can't be exported alongside server actions from one of
// those files, so anything reused across email-sending action files lives
// here instead.

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const URL_REGEX = /(https?:\/\/[^\s<]+)/g;

/**
 * Converts a plain-text template body (line breaks, bare URLs) into safe
 * HTML that reads the same as the original plain-text email — used for
 * templates authored as plain text (pricing requests, term sheet ready,
 * book a call) now that outgoing mail needs to be HTML to carry the company
 * logo. white-space:pre-wrap preserves line breaks without hand-converting
 * every \n to <br/>.
 */
export function plainTextToHtml(text: string): string {
  const html = escapeHtml(text).replace(
    URL_REGEX,
    (url) => `<a href="${url}" target="_blank" rel="noreferrer">${url}</a>`
  );
  return `<div style="white-space:pre-wrap; font-family:Arial,Helvetica,sans-serif; font-size:14px; color:#1f2937;">${html}</div>`;
}

/**
 * Same as plainTextToHtml, but for templates that need one or more of their
 * merge fields to come out as real HTML (a button, a fact list) instead of
 * escaped plain text — e.g. a raw internal PDF URL or a giant Google
 * Calendar scheduling link should never be shown to a borrower as literal
 * text. `blocks` maps a template's `{{tokenName}}` placeholder to the raw
 * HTML it should become; those placeholders must be left out of the
 * `tokens` passed to renderTemplate() so they survive into this function
 * still literally present (renderTemplate leaves unknown `{{keys}}` as-is),
 * then get swapped in here *after* the rest of the text is escaped — so the
 * block's own HTML tags never get escaped away, and nothing else in the
 * template can smuggle in unescaped HTML.
 */
export function plainTextToHtmlWithBlocks(text: string, blocks: Record<string, string>): string {
  let html = escapeHtml(text).replace(
    URL_REGEX,
    (url) => `<a href="${url}" target="_blank" rel="noreferrer">${url}</a>`
  );
  for (const [key, value] of Object.entries(blocks)) {
    html = html.split(`{{${key}}}`).join(value);
  }
  return `<div style="white-space:pre-wrap; font-family:Arial,Helvetica,sans-serif; font-size:14px; color:#1f2937;">${html}</div>`;
}

/**
 * Turns a plain-text template's "Label: value" line dumps into a real
 * bulleted, indented HTML list — without touching the template text itself,
 * so it's still just a plain-text {{token}} template, freely editable in
 * Settings → Email Templates. A lender fed this back as feedback: sent as
 * flat pre-wrap text, everything "comes in all together with no spacing."
 *
 * Line-by-line: a line ending in . ! or ? reads as a sentence (greeting,
 * intro, closing) and becomes its own paragraph; anything else (a
 * "Label: value" fact line, or a plain phrase like a checklist item) joins
 * a run of consecutive non-sentence lines, which becomes one <ul> once the
 * run ends (at a blank line or the next sentence) — a lone non-sentence
 * line becomes its own paragraph rather than a list of one. This is why
 * every pricing-request template's fact lines end in a value, never a
 * period: that's the one signal separating "prose" from "list item" here.
 */
export function plainTextToHtmlAutoList(text: string): string {
  const linkify = (s: string) =>
    escapeHtml(s).replace(URL_REGEX, (url) => `<a href="${url}" target="_blank" rel="noreferrer">${url}</a>`);

  const paragraph = (line: string) =>
    `<p style="margin:0 0 12px; line-height:1.5;">${linkify(line)}</p>`;

  const listItem = (line: string) => {
    const match = line.match(/^([^:]{2,60}):\s?(.*)$/);
    if (match && match[2].trim()) {
      const [, label, value] = match;
      return `<li style="${EMAIL_ITEM_STYLE}"><strong>${escapeHtml(label)}:</strong> ${linkify(value)}</li>`;
    }
    return `<li style="${EMAIL_ITEM_STYLE}">${linkify(line)}</li>`;
  };

  const out: string[] = [];
  let run: string[] = [];

  const flush = () => {
    if (run.length === 1) out.push(paragraph(run[0]));
    else if (run.length > 1) out.push(`<ul style="${EMAIL_LIST_STYLE}">${run.map(listItem).join("")}</ul>`);
    run = [];
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line === "") {
      flush();
    } else if (/[.!?]$/.test(line)) {
      flush();
      out.push(paragraph(line));
    } else {
      run.push(line);
    }
  }
  flush();

  return `<div style="font-family:Arial,Helvetica,sans-serif; font-size:14px; color:#1f2937;">${out.join("")}</div>`;
}

export const EMAIL_LIST_STYLE = "margin:0; padding-left:28px;";
export const EMAIL_ITEM_STYLE = "margin-bottom:12px; line-height:1.5;";
export const EMAIL_SUBNOTE_STYLE = "color:#6b7280; font-size:13px;";
export const EMAIL_SECTION_HEADING_STYLE = "margin:0 0 8px; font-size:14px; font-weight:700;";
export const EMAIL_BUTTON_STYLE =
  "display:inline-block; padding:10px 22px; background:#111827; color:#ffffff !important; font-weight:700; font-size:14px; text-decoration:none; border-radius:6px;";

export function htmlButton(label: string, url: string): string {
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer" style="${EMAIL_BUTTON_STYLE}">${escapeHtml(label)}</a>`;
}

/** A simple "Label: value" bullet list — for scannable facts (LTV, term, loan type) rather than htmlBulletList's name+subnote shape. */
export function htmlFactList(items: { label: string; value: string }[]): string {
  return `<ul style="${EMAIL_LIST_STYLE}">${items
    .map((i) => `<li style="${EMAIL_ITEM_STYLE}"><strong>${escapeHtml(i.label)}:</strong> ${escapeHtml(i.value)}</li>`)
    .join("")}</ul>`;
}

export function htmlBulletList(items: { name: string; note?: string | null }[]): string {
  return `<ul style="${EMAIL_LIST_STYLE}">${items
    .map(
      (i) =>
        `<li style="${EMAIL_ITEM_STYLE}"><strong>${escapeHtml(i.name)}</strong>${
          i.note ? `<br/><span style="${EMAIL_SUBNOTE_STYLE}">${escapeHtml(i.note)}</span>` : ""
        }</li>`
    )
    .join("")}</ul>`;
}

/**
 * Wraps inner content in the shared plain-letter shell used across
 * borrower/staff emails. No baked-in sign-off — the sending user's own
 * saved email signature (or nothing, for a purely internal notice) is
 * appended by the caller instead.
 */
export function emailShell({
  companyName,
  heading,
  bodyHtml,
}: {
  companyName: string;
  heading: string;
  bodyHtml: string;
}): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif; color:#1f2937; max-width:600px; font-size:14px;">
<p style="margin:0 0 4px; font-size:12px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:#1d4ed8;">${escapeHtml(companyName)}</p>
<h2 style="margin:0 0 20px; font-size:20px; font-weight:700; color:#111827;">${heading}</h2>
${bodyHtml}
</div>`;
}
