// Shared constants for the lead-generation system (calculator lead magnet,
// leads pipeline, speed-to-lead emails) — change them here once instead of
// in five different files.

const LOAN_OFFICER_ID = "70b5d857-8139-48d2-bb92-9b7fd7862a3b";

/** Relative path — use this for in-app links (no full reload). */
export const APPLY_PATH = `/intake/${LOAN_OFFICER_ID}`;
/** Absolute URL — use this anywhere the link leaves the app (emails, the Excel export). */
export const APPLY_URL = `https://mannalendingco.com${APPLY_PATH}`;

export const COMPANY_PHONE = "269-267-7506";
export const COMPANY_PHONE_TEL = "+12692677506";
export const COMPANY_EMAIL = "justin@creativecashpartners.com";
/** Where internal "hot lead" alerts and the daily digest go — overridable without a code change. */
export const NOTIFY_EMAIL = process.env.LEAD_NOTIFY_EMAIL ?? COMPANY_EMAIL;

/** CAN-SPAM requires a real postal address in every marketing email — see leadMarketingEmailFooter. */
export const COMPANY_MAILING_ADDRESS = "1813 Hawthorne Ave., Saint Joseph, MI 49085";

/** Public unsubscribe page for a lead's marketing emails — see unsubscribeLeadFromMarketing. */
export const UNSUBSCRIBE_PATH = (leadId: string) => `/unsubscribe/${leadId}`;
export const UNSUBSCRIBE_URL = (leadId: string) => `https://mannalendingco.com${UNSUBSCRIBE_PATH(leadId)}`;
