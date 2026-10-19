import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { partnerTokens, referralAffiliates } from "@/server/db/schema";
import { hashToken, newToken } from "@/server/partner/crypto";
import { appUrl, button, greeting, sendPartnerEmail } from "@/server/partner/email";
import { INVITE_LINK_DAYS } from "@/lib/partner-constants";
import { referralSlugFrom } from "@/lib/partner-comp";
import { escapeHtml } from "@/lib/email-html";

type Partner = typeof referralAffiliates.$inferSelect;

/** A fresh single-use invite link token (the raw token goes in the email; only its hash is stored). */
export async function createInviteToken(partnerId: string): Promise<string> {
  const token = newToken();
  await db.insert(partnerTokens).values({
    partnerId,
    purpose: "invite",
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + INVITE_LINK_DAYS * 24 * 60 * 60 * 1000),
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

export async function sendInviteEmail(partner: Partner, inviterName: string | null, token: string): Promise<boolean> {
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
