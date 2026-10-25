import { escapeHtml } from "@/lib/email-html";

/** Reasons the question isn't open; the stage-change popups stay quiet for these two. */
export const CTC_ALREADY_ANSWERED = "This question has already been answered for this deal.";
export const CTC_NOT_WAITING = "This deal isn't waiting on a Clear to Close email.";

export type TitleContact = {
  titleCompanyName: string | null;
  titleCompanyAgentName: string | null;
  titleAgentPhone: string | null;
  titleAgentEmail: string | null;
};

/** The template's key; also what the Email Templates screen lists it under. */
export const CLEAR_TO_CLOSE_TEMPLATE_KEY = "borrower_clear_to_close";

const BOX = "margin:0 0 20px; padding:16px 18px; background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px;";

/**
 * The "next step: schedule your closing" box. Shows only the title details we actually have, so a
 * deal with no title contact on file still reads naturally instead of printing "Not provided".
 */
export function buildTitleContactBlock(contact: TitleContact): string {
  const rows: [string, string][] = [];
  const add = (label: string, value: string | null) => {
    const v = value?.trim();
    if (v) rows.push([label, v]);
  };
  add("Title company", contact.titleCompanyName);
  add("Contact", contact.titleCompanyAgentName);
  add("Phone", contact.titleAgentPhone);
  add("Email", contact.titleAgentEmail);

  if (rows.length === 0) {
    return `<div style="${BOX}">
<p style="margin:0; font-size:15px; font-weight:700; color:#065f46;">Next step: schedule your closing</p>
<p style="margin:6px 0 0; font-size:14px; color:#065f46;">Your title company will be reaching out to you shortly to get a closing time on the calendar. If you haven&rsquo;t heard from them in a day or two, just reply to this email and we&rsquo;ll connect you.</p>
</div>`;
  }

  const table = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:2px 16px 2px 0; color:#6b7280;">${label}</td><td style="padding:2px 0; font-weight:700;">${escapeHtml(value)}</td></tr>`
    )
    .join("");

  return `<div style="${BOX}">
<p style="margin:0; font-size:15px; font-weight:700; color:#065f46;">Next step: schedule your closing</p>
<p style="margin:6px 0 0; font-size:14px; color:#065f46;">Your title company will be reaching out to you shortly to get a closing time on the calendar. If you&rsquo;d rather not wait, you can contact them directly and pick a time that works for you:</p>
</div>
<table role="presentation" style="margin:0 0 20px; border-collapse:collapse; font-size:14px;">${table}</table>`;
}

/**
 * Whether the deal should be offered the Clear to Close email right now: it's sitting at Clear to
 * Close, no one has answered yet, and there's an address to send it to.
 */
export function clearToCloseEmailPending(deal: {
  stage: string;
  borrowerEmail: string | null;
  clearToCloseEmailStatus: string | null;
}): boolean {
  return deal.stage === "clear_to_close" && !deal.clearToCloseEmailStatus && Boolean(deal.borrowerEmail?.trim());
}
