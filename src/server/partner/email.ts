import { and, asc, eq, ilike } from "drizzle-orm";
import { db } from "@/server/db/client";
import { companySettings, referralAffiliates, users } from "@/server/db/schema";
import { sendGmailAs } from "@/server/gmail/send";
import { getCompanyName, getCompanyLogoHtml } from "@/server/settings";
import { getUserEmailSignatureHtml } from "@/server/users";
import { createNotifications } from "@/server/notifications";
import { emailShell, escapeHtml, htmlButton } from "@/lib/email-html";

export type Partner = typeof referralAffiliates.$inferSelect;

export function appUrl(): string {
  return process.env.APP_URL ?? "https://mannalendingco.com";
}

export async function isProgramLive(): Promise<boolean> {
  const row = await db.query.companySettings.findFirst({ where: eq(companySettings.id, "default"), columns: { partnerProgramLive: true } });
  return Boolean(row?.partnerProgramLive);
}

async function isStaffEmail(email: string): Promise<boolean> {
  const staff = await db.query.users.findFirst({ where: ilike(users.email, email.trim()), columns: { id: true } });
  return Boolean(staff);
}

/**
 * While the program isn't live, partner email only goes to addresses that
 * belong to staff (so you can test end to end with your own address); everyone
 * else is silently skipped. Once the switch is on, everything sends.
 */
export async function partnerEmailAllowed(email: string): Promise<boolean> {
  return (await isProgramLive()) || (await isStaffEmail(email));
}

async function sender(partner?: Partner) {
  if (partner) {
    const inviter = await db.query.users.findFirst({ where: eq(users.id, partner.invitedByUserId) });
    if (inviter?.email) return { id: inviter.id, email: inviter.email };
  }
  const admin = await db.query.users.findFirst({ where: and(eq(users.isAdmin, true), eq(users.active, true)), orderBy: asc(users.createdAt) });
  return admin?.email ? { id: admin.id, email: admin.email } : null;
}

export function partnerFirstName(partner: Pick<Partner, "name" | "email">): string {
  return (partner.name ?? "").trim().split(/\s+/)[0] || "there";
}

/** Sends one branded email to a partner from the inviting loan officer's Gmail. Returns whether it went out. Never throws. */
export async function sendPartnerEmail(
  partner: Partner,
  { subject, heading, bodyHtml, dealId }: { subject: string; heading: string; bodyHtml: string; dealId?: string | null }
): Promise<boolean> {
  try {
    if (!(await partnerEmailAllowed(partner.email))) return false;
    const from = await sender(partner);
    if (!from) return false;
    const [companyName, logoHtml, signatureHtml] = await Promise.all([
      getCompanyName(),
      getCompanyLogoHtml(),
      getUserEmailSignatureHtml(from.id),
    ]);
    await sendGmailAs(from.id, from.email, {
      to: partner.email,
      subject,
      body: logoHtml + emailShell({ companyName, heading, bodyHtml }) + signatureHtml,
      html: true,
      dealId: dealId ?? null,
      category: "referral_affiliate",
    });
    return true;
  } catch (err) {
    console.error("Failed to send partner email:", err);
    return false;
  }
}

export function greeting(partner: Pick<Partner, "name" | "email">): string {
  return `<p style="margin:0 0 16px;">Hi ${escapeHtml(partnerFirstName(partner))},</p>`;
}

export function button(label: string, url: string): string {
  return `<p style="margin:16px 0;">${htmlButton(label, url)}</p>`;
}

/** Alerts the admins both in the CRM bell and by email. Best-effort; never throws. */
export async function notifyAdmins({
  type,
  title,
  body,
  href,
}: {
  type: string;
  title: string;
  body?: string;
  href?: string;
}): Promise<void> {
  try {
    const admins = await db.query.users.findMany({ where: and(eq(users.isAdmin, true), eq(users.active, true)), orderBy: asc(users.createdAt) });
    await createNotifications(admins.map((a) => a.id), { type, title, body, href });

    const from = admins.find((a) => a.email);
    if (!from?.email) return;
    const [companyName, logoHtml] = await Promise.all([getCompanyName(), getCompanyLogoHtml()]);
    const link = href ? `${appUrl()}${href}` : null;
    await sendGmailAs(from.id, from.email, {
      to: admins.map((a) => a.email).filter((e): e is string => Boolean(e)).join(", "),
      subject: title,
      body:
        logoHtml +
        emailShell({
          companyName,
          heading: escapeHtml(title),
          bodyHtml: `${body ? `<p style="margin:0 0 16px;">${escapeHtml(body)}</p>` : ""}${link ? button("Open in the CRM", link) : ""}`,
        }),
      html: true,
      category: "referral_affiliate",
    });
  } catch (err) {
    console.error("Failed to notify admins:", err);
  }
}
