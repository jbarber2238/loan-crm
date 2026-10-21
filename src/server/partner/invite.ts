import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { companySettings, emailTemplates, partnerTokens, referralAffiliates } from "@/server/db/schema";
import { hashToken, newToken } from "@/server/partner/crypto";
import { appUrl, button, greeting, sendPartnerEmail } from "@/server/partner/email";
import { DEFAULT_EXPIRES_DAYS, DEFAULT_REMINDER_DAYS, parseReminderDays } from "@/lib/partner-invite-cadence";
import { renderTemplate } from "@/server/pricing-templates";
import { referralSlugFrom } from "@/lib/partner-comp";
import { escapeHtml } from "@/lib/email-html";

type Partner = typeof referralAffiliates.$inferSelect;

export interface InviteSettings {
  reminderDays: number[];
  expiresDays: number;
}

/** When reminders go out and when an invite times out (Settings → Referrals). */
export async function getInviteSettings(): Promise<InviteSettings> {
  const row = await db.query.companySettings.findFirst({
    where: eq(companySettings.id, "default"),
    columns: { partnerInviteReminderDays: true, partnerInviteExpiresDays: true },
  });
  const days = parseReminderDays(row?.partnerInviteReminderDays);
  return {
    // An empty schedule is a real choice ("no reminders"); only fall back when nothing is saved.
    reminderDays: row ? days : DEFAULT_REMINDER_DAYS,
    expiresDays: row?.partnerInviteExpiresDays ?? DEFAULT_EXPIRES_DAYS,
  };
}

/**
 * A fresh single-use invite link token (the raw token goes in the email; only
 * its hash is stored). It lasts until `expiresAt`, by default the invite
 * timeout from now.
 */
export async function createInviteToken(partnerId: string, expiresAt?: Date): Promise<string> {
  const token = newToken();
  const { expiresDays } = expiresAt ? { expiresDays: 0 } : await getInviteSettings();
  await db.insert(partnerTokens).values({
    partnerId,
    purpose: "invite",
    tokenHash: hashToken(token),
    expiresAt: expiresAt ?? new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000),
  });
  return token;
}

export async function uniqueSlug(name: string | null, email: string): Promise<string> {
  const base = referralSlugFrom(name, email);
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const taken = await db.query.referralAffiliates.findFirst({ where: eq(referralAffiliates.referralSlug, candidate), columns: { id: true } });
    if (!taken) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDate = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;

/** Turns an editable template into the email body: blank-line-separated paragraphs, with the setup button where {{setupButton}} sits. */
function templateToHtml(body: string, setupButton: string): string {
  return body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => (block === "{{setupButton}}" ? setupButton : `<p style="margin:0 0 16px;">${escapeHtml(block).replace(/\n/g, "<br/>")}</p>`))
    .join("");
}

/** Sends one of the editable invite templates to a partner. Returns false when the template is missing or the send is skipped. */
export async function sendInviteTemplate(
  partner: Partner,
  key: string,
  opts: { inviterName: string | null; setupUrl: string; setupLabel?: string; expiresAt: Date }
): Promise<boolean> {
  const template = await db.query.emailTemplates.findFirst({ where: eq(emailTemplates.key, key) });
  if (!template || !template.active) return false;
  const first = (partner.name ?? "").trim().split(/\s+/)[0];
  const daysLeft = Math.max(0, Math.ceil((opts.expiresAt.getTime() - Date.now()) / DAY_MS));
  const tokens = {
    firstName: first || "there",
    inviterName: opts.inviterName ?? "Justin",
    expiryDate: longDate(opts.expiresAt),
    daysLeft: String(daysLeft),
  };
  // Text tokens fill in first; {{setupButton}} survives as its own paragraph and becomes the button.
  const subject = renderTemplate(template.subject, tokens);
  const bodyHtml = templateToHtml(renderTemplate(template.body, tokens), button(opts.setupLabel ?? "Set up your partner account", opts.setupUrl));
  return sendPartnerEmail(partner, { subject, heading: subject, bodyHtml });
}

export async function sendInviteEmail(partner: Partner, inviterName: string | null, token: string, expiresAt?: Date): Promise<boolean> {
  const { expiresDays } = await getInviteSettings();
  const sent = await sendInviteTemplate(partner, "partner_invite_initial", {
    inviterName,
    setupUrl: `${appUrl()}/partner/join/${token}`,
    expiresAt: expiresAt ?? new Date(Date.now() + expiresDays * DAY_MS),
  });
  if (sent) return true;
  // The template isn't installed (yet): fall back to the original wording.
  return sendPartnerEmail(partner, {
    subject: `${inviterName ?? "Justin"} invited you to the Manna Lending partner program`,
    heading: "You're invited to the Manna Lending partner program",
    bodyHtml:
      greeting(partner) +
      `<p style="margin:0 0 16px;">${escapeHtml(inviterName ?? "Our team")} invited you to join the Manna Lending partner program. Refer a borrower, watch every step of their loan in your own portal, and get paid when it closes.</p>` +
      `<p style="margin:0 0 16px;">Setting up takes about two minutes.</p>` +
      button("Set up your partner account", `${appUrl()}/partner/join/${token}`),
  });
}

/** Who a self-served partner is "invited by": the loan officer, else the oldest admin. */
export async function defaultInviter(): Promise<{ id: string; name: string | null } | null> {
  const lo = await db.query.users.findFirst({
    where: (u, { and, eq: e }) => and(e(u.baseRole, "loan_officer"), e(u.active, true)),
    orderBy: (u, { asc }) => asc(u.createdAt),
  });
  if (lo) return { id: lo.id, name: lo.name };
  const admin = await db.query.users.findFirst({
    where: (u, { and, eq: e }) => and(e(u.isAdmin, true), e(u.active, true)),
    orderBy: (u, { asc }) => asc(u.createdAt),
  });
  return admin ? { id: admin.id, name: admin.name } : null;
}

export interface SetupLink {
  partner: Partner;
  /** The wizard link, or null when this person already finished setting up. */
  url: string | null;
  created: boolean;
}

/**
 * The partner-setup link for an email address: creates the invited partner
 * record if there isn't one, or issues a fresh link for someone who hasn't
 * finished. Someone already active (or paused / pre-portal) gets no link.
 */
export async function issuePartnerSetupLink(email: string, name?: string | null): Promise<SetupLink | null> {
  const clean = email.trim().toLowerCase();
  let partner = await db.query.referralAffiliates.findFirst({ where: eq(referralAffiliates.email, clean) });
  let created = false;
  if (!partner) {
    const inviter = await defaultInviter();
    if (!inviter) return null;
    const [row] = await db
      .insert(referralAffiliates)
      .values({
        email: clean,
        name: name?.trim() || null,
        invitedByUserId: inviter.id,
        status: "invited",
        referralSlug: await uniqueSlug(name ?? null, clean),
        portalInvitedAt: new Date(),
      })
      .returning();
    partner = row;
    created = true;
  }
  if (partner.status !== "invited" && partner.status !== "profile_complete") return { partner, url: null, created };
  const token = await createInviteToken(partner.id);
  return { partner, url: `${appUrl()}/partner/join/${token}`, created };
}
