import { asc, desc, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import { leads, users, type leadStatusEnum } from "@/server/db/schema";
import { sendGmailAs } from "@/server/gmail/send";
import { getCompanyName, getCompanyLogoHtml } from "@/server/settings";
import { htmlButton, emailShell } from "@/lib/email-html";
import { NOTIFY_EMAIL } from "@/lib/lead-constants";

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

export async function sendLeadWelcomeEmail(lead: Lead, calculatorUrl: string, excelNote: string): Promise<void> {
  const sender = await getSystemSender();
  if (!sender) return;

  const companyName = await getCompanyName();
  const logoHtml = await getCompanyLogoHtml();
  const firstName = lead.name.trim().split(/\s+/)[0] || lead.name;

  const body = emailShell({
    companyName,
    heading: "Here's your calculator",
    bodyHtml: `
      <p style="margin:0 0 16px;">Hi ${firstName},</p>
      <p style="margin:0 0 16px;">Thanks for grabbing the Max Allowable Offer Calculator — here's your link back to it any time:</p>
      <p style="margin:0 0 16px;">${htmlButton("Open the calculator", calculatorUrl)}</p>
      <p style="margin:0 0 16px;">${excelNote}</p>
      <p style="margin:0 0 16px;">One question: what deal are you looking at? Just reply to this email and let me know — I'll take a look.</p>
    `,
  });

  await sendGmailAs(sender.id, sender.email, {
    to: lead.email,
    replyTo: NOTIFY_EMAIL,
    subject: "Your Max Allowable Offer Calculator",
    body: logoHtml + body,
    html: true,
    category: "lead_magnet_welcome",
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
