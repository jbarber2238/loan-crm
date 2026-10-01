import { asc, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import { leads, users, type leadStatusEnum } from "@/server/db/schema";
import { sendGmailAs } from "@/server/gmail/send";
import { getCompanyName, getCompanyLogoHtml } from "@/server/settings";
import { getUserEmailSignatureHtml } from "@/server/users";
import { htmlButton, emailShell } from "@/lib/email-html";
import { leadMarketingEmailFooter } from "@/lib/lead-email-footer";
import { NOTIFY_EMAIL, APPLY_URL } from "@/lib/lead-constants";
import { generateMaxOfferExcelAttachment } from "@/server/max-offer-excel-server";
import type { MaxOfferExcelInputs } from "@/lib/max-offer-excel-export";

type Lead = typeof leads.$inferSelect;

// Every automated lead email goes out "as" this one account rather than a
// specific staffer's own Gmail (the pattern every other email in this app
// uses) — there's no logged-in user behind a public form submission to send
// "as." Reuses the same "oldest admin" lookup notifyAdminOfNewDeal already
// uses in src/server/deal-notifications.ts.
async function getSystemSender() {
  const admin = await db.query.users.findFirst({
    where: eq(users.isAdmin, true),
    orderBy: asc(users.createdAt),
  });
  if (!admin?.email) return null;
  return { id: admin.id, email: admin.email, name: admin.name };
}

// Everything below only implements the email channel. If SMS is ever added
// (once A2P registration is done), it plugs in here as a second call
// alongside each sendGmailAs call — the status-transition and "should this
// fire" logic above this layer doesn't change.

// Sent the moment the Excel-download gate form is submitted — the Excel
// file itself downloads immediately in the browser (see
// downloadMaxOfferExcel), so this email isn't the delivery mechanism for
// the file; it's the follow-up that gives them the same file as an
// attachment (in case the browser download gets lost or they're on a
// different device later), a link back to the live calculator, and —
// deliberately, not a generic "what deal are you looking at?" question —
// a next step that depends on whether they said they have a deal under
// contract: a push to submit it if so, nothing pushy if not (that signal
// alone already lowers their priority via computeStatusAfterEvent).
export async function sendMaxOfferExcelEmail(
  lead: Lead,
  inputs: MaxOfferExcelInputs,
  calculatorUrl: string,
  hasDealUnderContract: boolean | null
): Promise<void> {
  // Marketing email — honor an opt-out even though, in practice, a fresh
  // gate-form submission always clears this first (see submitLead).
  if (lead.unsubscribedAt) return;

  const sender = await getSystemSender();
  if (!sender) return;

  const [companyName, logoHtml, signatureHtml, attachment] = await Promise.all([
    getCompanyName(),
    getCompanyLogoHtml(),
    getUserEmailSignatureHtml(sender.id),
    generateMaxOfferExcelAttachment(inputs),
  ]);
  const firstName = lead.name.trim().split(/\s+/)[0] || lead.name;

  const nextStepHtml = hasDealUnderContract
    ? `
      <p style="margin:0 0 16px;">Since you've got a deal under contract, the fastest next step is to submit it so we can get you a term sheet:</p>
      <p style="margin:0 0 16px;">${htmlButton("Submit your deal", APPLY_URL)}</p>
    `
    : "";

  const body = emailShell({
    companyName,
    heading: "Here's your Excel file",
    bodyHtml: `
      <p style="margin:0 0 16px;">Hi ${firstName},</p>
      <p style="margin:0 0 16px;">Your Max Allowable Offer Calculator is attached as an Excel file, pre-filled with the numbers you entered — the formulas are all live, so you can keep testing different deals right in the spreadsheet. Here's your link back to the calculator itself any time:</p>
      <p style="margin:0 0 16px;">${htmlButton("Open the calculator", calculatorUrl)}</p>
      ${nextStepHtml}
      <p style="margin:0 0 16px;">If you have any questions about your numbers, just reply to this email.</p>
    `,
  });

  await sendGmailAs(sender.id, sender.email, {
    to: lead.email,
    replyTo: NOTIFY_EMAIL,
    subject: "Your Max Allowable Offer Calculator",
    body: logoHtml + body + signatureHtml + leadMarketingEmailFooter(lead.id),
    html: true,
    category: "lead_magnet_welcome",
    attachments: [attachment],
  });
}

// Fires on every Excel-gate submission, regardless of how it's answered —
// unlike sendHotLeadAlert below, which only fires once a lead's status
// actually crosses into "hot" (a deal under contract, a fast close, an
// on-target CTA click). Justin wants to know every time someone fills out
// the gate, not just the subset that happens to score hot; the two emails
// can both land for the same lead, and that's fine — this one says "someone
// just came in," that one says "this one's worth a closer look now."
export async function sendLeadCapturedAlert(
  lead: Lead,
  hasDealUnderContract: boolean | null,
  closingTimeline: string | null
): Promise<void> {
  const sender = await getSystemSender();
  if (!sender) return;

  const companyName = await getCompanyName();
  const logoHtml = await getCompanyLogoHtml();

  const dealLine =
    hasDealUnderContract === true
      ? `Deal under contract: Yes${closingTimeline ? ` · Needs to close in ${closingTimeline}` : ""}`
      : hasDealUnderContract === false
        ? "Deal under contract: No"
        : null;

  const body = emailShell({
    companyName,
    heading: "New calculator lead",
    bodyHtml: `
      <p style="margin:0 0 16px;"><strong>${lead.name}</strong> requested the Max Allowable Offer Calculator's Excel version.</p>
      <p style="margin:0 0 16px;">
        Phone: <a href="tel:${lead.phone}">${lead.phone}</a><br/>
        Email: <a href="mailto:${lead.email}">${lead.email}</a>
      </p>
      ${dealLine ? `<p style="margin:0 0 16px;">${dealLine}</p>` : ""}
    `,
  });

  await sendGmailAs(sender.id, sender.email, {
    to: NOTIFY_EMAIL,
    subject: `New calculator lead — ${lead.name}`,
    body: logoHtml + body,
    html: true,
    category: "lead_magnet_new_lead",
  });
}

export async function sendHotLeadAlert(lead: Lead): Promise<void> {
  const sender = await getSystemSender();
  if (!sender) return;

  const companyName = await getCompanyName();
  const logoHtml = await getCompanyLogoHtml();
  const results = (lead.lastCalculatorResults ?? {}) as Record<string, number | undefined>;

  const dealLines = [
    results.arv ? `ARV: $${results.arv.toLocaleString()}` : null,
    results.purchasePrice ? `Purchase Price: $${results.purchasePrice.toLocaleString()}` : null,
    results.profitMarginPct !== undefined ? `Margin: ${results.profitMarginPct.toFixed(1)}%` : null,
  ]
    .filter((l): l is string => Boolean(l))
    .join("<br/>");

  const body = emailShell({
    companyName,
    heading: "🔥 Hot lead",
    bodyHtml: `
      <p style="margin:0 0 16px;"><strong>${lead.name}</strong></p>
      <p style="margin:0 0 16px;">
        Phone: <a href="tel:${lead.phone}">${lead.phone}</a><br/>
        Email: <a href="mailto:${lead.email}">${lead.email}</a>
      </p>
      ${dealLines ? `<p style="margin:0 0 16px;">${dealLines}</p>` : ""}
      <p style="margin:0 0 16px;">Source: ${lead.source}</p>
    `,
  });

  await sendGmailAs(sender.id, sender.email, {
    to: NOTIFY_EMAIL,
    subject: `Hot lead — ${lead.name}`,
    body: logoHtml + body,
    html: true,
    category: "lead_magnet_hot_alert",
  });
}

/** Cron entry point — run once daily. Lists everyone still at New/Engaged with any activity in the last 24 hours, so this doesn't just repeat the same stale list every day. */
export async function sendLeadDailyDigest(): Promise<{ sent: boolean; count: number }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recentLeads = await db.query.leads.findMany({
    where: (l, { and: andL }) =>
      andL(inArray(l.status, ["new", "engaged"] satisfies (typeof leadStatusEnum.enumValues)[number][]), gte(l.lastActivityAt, since)),
    orderBy: desc(leads.lastActivityAt),
  });
  if (!recentLeads.length) return { sent: false, count: 0 };

  const sender = await getSystemSender();
  if (!sender) return { sent: false, count: 0 };

  const companyName = await getCompanyName();
  const logoHtml = await getCompanyLogoHtml();

  const rows = recentLeads
    .map(
      (l) =>
        `<tr><td style="padding:6px 12px 6px 0;">${l.name}</td><td style="padding:6px 12px;">${l.status}</td><td style="padding:6px 12px;"><a href="tel:${l.phone}">${l.phone}</a></td><td style="padding:6px 0;">${l.source}</td></tr>`
    )
    .join("");

  const body = emailShell({
    companyName,
    heading: `${recentLeads.length} lead${recentLeads.length === 1 ? "" : "s"} with recent activity`,
    bodyHtml: `<table style="border-collapse:collapse;font-size:14px;">${rows}</table>`,
  });

  await sendGmailAs(sender.id, sender.email, {
    to: NOTIFY_EMAIL,
    subject: `Daily lead digest — ${recentLeads.length} active`,
    body: logoHtml + body,
    html: true,
    category: "lead_magnet_daily_digest",
  });

  return { sent: true, count: recentLeads.length };
}
