import { escapeHtml } from "@/lib/email-html";

// Every lender submission email names the property in both the subject and the body, whatever the lender's own
// intro template (or a hand edit in the compose window) says. These add it only when it's missing.

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

function hasAddress(text: string, address: string): boolean {
  const a = norm(address);
  return a.length > 0 && norm(text).includes(a);
}

/** "New Loan Submission" becomes "New Loan Submission — 123 Main St"; left alone when it already has the address. */
export function ensureAddressInSubject(subject: string, address: string): string {
  const addr = address.trim();
  if (!addr || hasAddress(subject, addr)) return subject;
  const base = subject.trim();
  return base ? `${base} — ${addr}` : addr;
}

/**
 * Plain-text body: a "Property:" line right after the opening line (the greeting), so it reads
 * "Hi Chris, / Property: 123 Main St / Please find our submission below."
 */
export function ensureAddressInText(body: string, address: string): string {
  const addr = address.trim();
  if (!addr || hasAddress(body, addr)) return body;
  const line = `Property: ${addr}`;
  const split = body.indexOf("\n\n");
  return split === -1 ? `${line}\n\n${body}` : `${body.slice(0, split)}\n\n${line}${body.slice(split)}`;
}

/** The same for an HTML body (what the compose window sends): a "Property:" paragraph at the very top when it's missing. */
export function ensureAddressInHtml(html: string, address: string): string {
  const addr = address.trim();
  if (!addr) return html;
  const text = html.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
  if (hasAddress(text, addr)) return html;
  return `<p><strong>Property:</strong> ${escapeHtml(addr)}</p>${html}`;
}
