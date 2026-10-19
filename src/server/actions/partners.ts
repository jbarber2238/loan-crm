"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { fail } from "@/lib/action-result";
import { companySettings, deals, partnerPayouts, referralAffiliates } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { appUrl, button, greeting, isProgramLive, sendPartnerEmail } from "@/server/partner/email";
import { logPartnerEvent } from "@/server/partner/events";
import { decryptSecret } from "@/server/partner/crypto";
import { markBrokerFeeReceived } from "@/server/partner/payouts";
import { createInviteToken, sendInviteEmail, uniqueSlug } from "@/server/partner/invite";
import { isPgErrorCode } from "@/lib/pg-error";
import { escapeHtml } from "@/lib/email-html";

function revalidatePartnerViews() {
  revalidatePath("/settings/referrals");
}

// ---- Invite -----------------------------------------------------------------

export async function invitePartner(formData: FormData) {
  const admin = await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim() || null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email address.");
  if (await db.query.referralAffiliates.findFirst({ where: eq(referralAffiliates.email, email), columns: { id: true } })) {
    return fail("A partner with that email already exists.");
  }

  const [partner] = await db
    .insert(referralAffiliates)
    .values({
      email,
      name,
      invitedByUserId: admin.id,
      status: "invited",
      referralSlug: await uniqueSlug(name, email),
      portalInvitedAt: new Date(),
    })
    .returning();

  await logPartnerEvent(partner.id, "invited", { by: admin.id });
  const sent = await sendInviteEmail(partner, admin.name ?? null, await createInviteToken(partner.id));
  revalidatePartnerViews();
  return { sent };
}

export async function resendPartnerInvite(partnerId: string) {
  const admin = await requireAdmin();
  const partner = await db.query.referralAffiliates.findFirst({ where: eq(referralAffiliates.id, partnerId) });
  if (!partner) return fail("Partner not found");
  if (partner.status !== "invited" && partner.status !== "profile_complete") {
    return fail("This partner has already finished setting up.");
  }
  const sent = await sendInviteEmail(partner, admin.name ?? null, await createInviteToken(partner.id));
  await db.update(referralAffiliates).set({ portalInvitedAt: new Date() }).where(eq(referralAffiliates.id, partnerId));
  await logPartnerEvent(partner.id, "nudged", { manual: true });
  revalidatePartnerViews();
  return { sent };
}

/**
 * One-time button: moves the affiliates from before the portal into the partner
 * program and emails each one to set a password and accept the terms. Refuses
 * until the program is switched live, so nobody gets the email early.
 */
export async function migrateLegacyPartners() {
  const admin = await requireAdmin();
  if (!(await isProgramLive())) {
    return fail('Turn on "Partner program live" first — this sends each existing affiliate an email.');
  }
  const legacy = await db.query.referralAffiliates.findMany({ where: eq(referralAffiliates.status, "legacy") });
  let migrated = 0;
  for (const partner of legacy) {
    const slug = partner.referralSlug ?? (await uniqueSlug(partner.name, partner.email));
    const [updated] = await db
      .update(referralAffiliates)
      .set({ status: "invited", referralSlug: slug, portalInvitedAt: new Date() })
      .where(eq(referralAffiliates.id, partner.id))
      .returning();
    await logPartnerEvent(partner.id, "migrated", { by: admin.id });
    await sendInviteEmail(updated, admin.name ?? null, await createInviteToken(partner.id));
    migrated++;
  }
  revalidatePartnerViews();
  return { migrated };
}

// ---- Management ------------------------------------------------------------

export async function setProgramLive(live: boolean) {
  await requireAdmin();
  await db
    .insert(companySettings)
    .values({ id: "default", name: process.env.COMPANY_NAME ?? "Manna Lending", partnerProgramLive: live })
    .onConflictDoUpdate({ target: companySettings.id, set: { partnerProgramLive: live } });
  revalidatePartnerViews();
}

export async function setPartnerStatus(partnerId: string, status: "active" | "paused") {
  await requireAdmin();
  const partner = await db.query.referralAffiliates.findFirst({ where: eq(referralAffiliates.id, partnerId) });
  if (!partner) return fail("Partner not found");
  if (partner.status !== "active" && partner.status !== "paused") return fail("Only an active partner can be paused or resumed.");
  await db.update(referralAffiliates).set({ status }).where(eq(referralAffiliates.id, partnerId));
  await logPartnerEvent(partnerId, status === "paused" ? "paused" : "resumed");
  revalidatePartnerViews();
}

export async function setPartnerTier(partnerId: string, tier: 20 | 25) {
  await requireAdmin();
  await db
    .update(referralAffiliates)
    .set({
      tier,
      tierEarnedAt: tier === 25 ? new Date() : null,
      tierStickyUntil: tier === 25 ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) : null,
      tierAtRiskNotifiedAt: null,
    })
    .where(eq(referralAffiliates.id, partnerId));
  await logPartnerEvent(partnerId, "tier_change", { to: tier, manual: true });
  revalidatePartnerViews();
}

// Hard delete: only a partner with no referred deals and no payouts has nothing to protect.
export async function deletePartner(partnerId: string) {
  await requireAdmin();
  try {
    await db.delete(referralAffiliates).where(eq(referralAffiliates.id, partnerId));
  } catch (err) {
    if (isPgErrorCode(err, "23503")) return fail("Can't remove — this partner has referred deals or payouts on file. Pause them instead.");
    throw err;
  }
  revalidatePartnerViews();
}

/** Admin-only: point a deal at a different partner (or none). The only way a referral's partner ever changes after submission; logged. */
export async function assignDealPartner(dealId: string, partnerId: string | null) {
  const admin = await requireAdmin();
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId), columns: { id: true, referredByAffiliateId: true } });
  if (!deal) return fail("Deal not found");
  if (deal.referredByAffiliateId === partnerId) return;

  const payout = await db.query.partnerPayouts.findFirst({ where: eq(partnerPayouts.dealId, dealId) });
  if (payout && payout.status === "paid") return fail("This referral's payout has already been paid, so its partner can't be changed.");
  if (payout) await db.delete(partnerPayouts).where(eq(partnerPayouts.id, payout.id));

  await db
    .update(deals)
    .set({ referredByAffiliateId: partnerId, partnerVisibleStage: null, partnerPayoutKind: null, updatedAt: new Date() })
    .where(eq(deals.id, dealId));
  if (partnerId) await logPartnerEvent(partnerId, "attribution_changed", { by: admin.id, from: deal.referredByAffiliateId, to: partnerId }, dealId);
  if (deal.referredByAffiliateId) await logPartnerEvent(deal.referredByAffiliateId, "attribution_changed", { by: admin.id, from: deal.referredByAffiliateId, to: partnerId }, dealId);
  revalidatePath(`/deals/${dealId}`);
  revalidatePartnerViews();
}

// ---- Money -----------------------------------------------------------------

export async function markBrokerFeeReceivedAction(dealId: string, formData: FormData) {
  await requireAdmin();
  const dateRaw = String(formData.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) return fail("Pick the date the fee arrived.");
  const amountRaw = String(formData.get("amount") ?? "").replace(/[$,\s]/g, "");
  const collected = amountRaw ? Number(amountRaw) : null;
  if (collected !== null && (!Number.isFinite(collected) || collected <= 0)) return fail("Enter the fee amount as a number.");
  await markBrokerFeeReceived(dealId, { collected, date: new Date(dateRaw) });
  revalidatePath(`/deals/${dealId}`);
  revalidatePartnerViews();
}

export async function markPayoutPaidAction(payoutId: string, formData: FormData) {
  const admin = await requireAdmin();
  const payout = await db.query.partnerPayouts.findFirst({ where: eq(partnerPayouts.id, payoutId), with: { deal: { columns: { id: true, propertyAddress: true } }, partner: true } });
  if (!payout) return fail("Payout not found");
  if (payout.status === "paid") return fail("Already marked paid.");
  if (payout.status !== "ready") {
    return fail(
      "This payout isn't ready yet — it needs the partner's payment details and the broker fee marked received first."
    );
  }
  const dateRaw = String(formData.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) return fail("Pick the date you paid.");
  const amount = Number(String(formData.get("amount") ?? "").replace(/[$,\s]/g, ""));
  if (!Number.isFinite(amount) || amount <= 0) return fail("Enter the amount you paid.");

  await db
    .update(partnerPayouts)
    .set({ status: "paid", paidDate: new Date(dateRaw), paidAmount: amount.toFixed(2), updatedAt: new Date() })
    .where(eq(partnerPayouts.id, payoutId));
  await db.update(deals).set({ referralFeePaidAt: new Date(dateRaw) }).where(eq(deals.id, payout.dealId));
  await logPartnerEvent(payout.partnerId, "payout_paid", { amount, by: admin.id }, payout.dealId);

  const paidTotal = await db
    .select({ total: sql<string>`coalesce(sum(${partnerPayouts.paidAmount}), 0)` })
    .from(partnerPayouts)
    .where(and(eq(partnerPayouts.partnerId, payout.partnerId), eq(partnerPayouts.status, "paid")));
  await sendPartnerEmail(payout.partner, {
    subject: `You've been paid — $${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`,
    heading: "Your payout was sent",
    bodyHtml:
      greeting(payout.partner) +
      `<p style="margin:0 0 16px;">We sent <strong>$${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}</strong> by ACH on your referral at ${escapeHtml(payout.deal.propertyAddress.split(",")[0])}. It should reach your account within a business day or two.</p>` +
      `<p style="margin:0 0 16px;">Paid to date: $${Number(paidTotal[0]?.total ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}. Thank you — keep them coming.</p>` +
      button("See it in your portal", `${appUrl()}/partner`),
    dealId: payout.dealId,
  });
  revalidatePath(`/deals/${payout.dealId}`);
  revalidatePartnerViews();
}

/** Admin-only, and always logged: shows the full banking details once. */
export async function revealPartnerBanking(partnerId: string) {
  const admin = await requireAdmin();
  const partner = await db.query.referralAffiliates.findFirst({ where: eq(referralAffiliates.id, partnerId) });
  if (!partner?.bankingEncrypted) return fail("No typed banking details on file (check for an uploaded document instead).");
  await logPartnerEvent(partnerId, "banking_viewed", { by: admin.id });
  const details = JSON.parse(decryptSecret(partner.bankingEncrypted)) as {
    accountHolder: string;
    routing: string;
    account: string;
    accountType: string;
  };
  return details;
}
