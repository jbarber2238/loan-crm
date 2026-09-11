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

export const EMAIL_LIST_STYLE = "margin:0; padding-left:20px;";
export const EMAIL_ITEM_STYLE = "margin-bottom:12px; line-height:1.5;";
export const EMAIL_SUBNOTE_STYLE = "color:#6b7280; font-size:13px;";
export const EMAIL_SECTION_HEADING_STYLE = "margin:0 0 8px; font-size:14px; font-weight:700;";
export const EMAIL_BUTTON_STYLE =
  "display:inline-block; padding:10px 22px; background:#111827; color:#ffffff !important; font-weight:700; font-size:14px; text-decoration:none; border-radius:6px;";

export function htmlButton(label: string, url: string): string {
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer" style="${EMAIL_BUTTON_STYLE}">${escapeHtml(label)}</a>`;
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

/** Wraps inner content in the shared plain-letter shell used across borrower/staff emails. */
export function emailShell({
  companyName,
  heading,
  bodyHtml,
  signOffName,
}: {
  companyName: string;
  heading: string;
  bodyHtml: string;
  signOffName: string;
}): string {
  return `<div style="font-family:Arial,Helvetica,sans-serif; color:#1f2937; max-width:600px; font-size:14px;">
<p style="margin:0 0 4px; font-size:12px; font-weight:700; letter-spacing:0.04em; text-transform:uppercase; color:#1d4ed8;">${escapeHtml(companyName)}</p>
<h2 style="margin:0 0 20px; font-size:20px; font-weight:700; color:#111827;">${heading}</h2>
${bodyHtml}
<p style="margin:20px 0 0;">${escapeHtml(signOffName)}<br/>${escapeHtml(companyName)}</p>
</div>`;
}
