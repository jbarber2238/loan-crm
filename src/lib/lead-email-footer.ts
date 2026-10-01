import { escapeHtml } from "@/lib/email-html";
import { COMPANY_MAILING_ADDRESS, UNSUBSCRIBE_URL } from "@/lib/lead-constants";

/**
 * CAN-SPAM footer for lead-magnet marketing emails specifically — a real
 * postal address and a working opt-out link, required on every commercial
 * email regardless of prior consent. Deliberately NOT used on transactional
 * deal emails (term sheets, client-needs updates): those go to someone
 * already in an active transaction, where "unsubscribe" doesn't apply the
 * same way and CAN-SPAM's stricter marketing-email rules don't bite.
 */
export function leadMarketingEmailFooter(leadId: string): string {
  const unsubscribeUrl = UNSUBSCRIBE_URL(leadId);
  return `
    <div style="margin-top:32px; padding-top:16px; border-top:1px solid #e5e7eb; font-size:11px; line-height:1.6; color:#9ca3af;">
      <p style="margin:0 0 4px;">${escapeHtml(COMPANY_MAILING_ADDRESS)}</p>
      <p style="margin:0;">
        <a href="${escapeHtml(unsubscribeUrl)}" target="_blank" rel="noreferrer" style="color:#9ca3af; text-decoration:underline;">Unsubscribe</a>
        from marketing emails like this one.
      </p>
    </div>`;
}
