import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals, referralAffiliates } from "@/server/db/schema";
import {
  PAUSED_MICROCOPY,
  PARTNER_STAGE_LABELS,
  estimatePayout,
  formatPayoutEstimate,
  partnerStageFor,
  payoutRate,
} from "@/lib/partner-comp";
import { appUrl, button, greeting, notifyAdmins, sendPartnerEmail } from "@/server/partner/email";
import { logPartnerEvent } from "@/server/partner/events";
import { ensurePayoutForClosedDeal, findTrailingPartnerFor, recomputePayoutStatuses } from "@/server/partner/payouts";
import { escapeHtml } from "@/lib/email-html";

type Deal = typeof deals.$inferSelect;
type Partner = typeof referralAffiliates.$inferSelect;

function street(address: string): string {
  return address.split(",")[0].trim() || address;
}

function estimateFor(deal: Deal, partner: Partner) {
  const kind = deal.partnerPayoutKind === "trailing" ? "trailing" : "first";
  return estimatePayout({
    ratePercent: payoutRate(kind, partner.tier),
    loanAmountRequested: Number(deal.loanAmountRequested) || 0,
    approvedLoanAmount: deal.approvedLoanAmount ? Number(deal.approvedLoanAmount) : null,
    originationPointsOverride: deal.originationPointsOverride !== null ? Number(deal.originationPointsOverride) : null,
    brokerFeeCollected: deal.brokerFeeCollected ? Number(deal.brokerFeeCollected) : null,
  });
}

function payoutLine(deal: Deal, partner: Partner): string {
  return `<p style="margin:0 0 16px;"><strong>Your payout on this referral:</strong> ${escapeHtml(formatPayoutEstimate(estimateFor(deal, partner)))}</p>`;
}

const portalUrl = () => `${appUrl()}/partner`;

/**
 * Runs right after a deal is created through (or matched to) a partner: finds a
 * trailing partner when the borrower is a repeat of someone's referral, tells
 * the partner their referral landed, and alerts the admins. Never throws.
 */
export async function onReferralCreated(dealId: string): Promise<void> {
  try {
    let deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
    if (!deal) return;

    // A returning borrower inside someone's 24-month trailing window belongs to
    // that partner; if they arrived through a different partner's link we keep
    // that link and flag the conflict for an admin instead of guessing.
    const trailing = await findTrailingPartnerFor(deal);
    if (trailing && !deal.referredByAffiliateId) {
      await db.update(deals).set({ referredByAffiliateId: trailing.partnerId, partnerPayoutKind: "trailing" }).where(eq(deals.id, dealId));
      await logPartnerEvent(trailing.partnerId, "attribution_changed", { reason: "repeat borrower within 24 months", automatic: true }, dealId);
      deal = { ...deal, referredByAffiliateId: trailing.partnerId, partnerPayoutKind: "trailing" };
    } else if (trailing && deal.referredByAffiliateId && deal.referredByAffiliateId !== trailing.partnerId) {
      await logPartnerEvent(trailing.partnerId, "attribution_conflict", { arrivedVia: deal.referredByAffiliateId }, dealId);
      await notifyAdmins({
        type: "partner_attribution_conflict",
        title: `Attribution conflict: ${deal.propertyAddress}`,
        body: "This borrower is a repeat of another partner's referral but arrived through a different partner's link. Review who it belongs to.",
        href: `/deals/${dealId}`,
      });
    }

    if (!deal.referredByAffiliateId) return;
    const partner = await db.query.referralAffiliates.findFirst({ where: eq(referralAffiliates.id, deal.referredByAffiliateId) });
    if (!partner) return;

    await db.update(deals).set({ partnerVisibleStage: "submitted" }).where(eq(deals.id, dealId));
    await logPartnerEvent(partner.id, "referral_submitted", { property: deal.propertyAddress }, dealId);

    await notifyAdmins({
      type: "partner_referral",
      title: `New partner referral from ${partner.name ?? partner.email}`,
      body: `${deal.borrowerName} — ${deal.propertyAddress}`,
      href: `/deals/${dealId}`,
    });

    if (partner.status === "active") {
      await sendPartnerEmail(partner, {
        subject: `Your referral was submitted — ${street(deal.propertyAddress)}`,
        heading: "Your referral was submitted",
        bodyHtml:
          greeting(partner) +
          `<p style="margin:0 0 16px;">${escapeHtml(deal.borrowerName)}'s request on ${escapeHtml(street(deal.propertyAddress))} just came in through your link.</p>` +
          payoutLine(deal, partner) +
          `<p style="margin:0 0 16px;">You'll see every step it takes in your portal.</p>` +
          button("Open your portal", portalUrl()),
        dealId,
      });
    }
  } catch (err) {
    console.error("onReferralCreated failed:", err);
  }
}

/**
 * The one place partner notifications fire from: any change to a deal's stage,
 * whatever caused it (manual dropdown, drag, an automatic advance). Only a
 * change in the *partner-facing* stage notifies, so internal moves like Rate
 * Shopping <-> Negotiation never ping anyone. Never throws.
 */
export async function onDealStageChanged(dealId: string, toStage: string): Promise<void> {
  try {
    const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
    if (!deal?.referredByAffiliateId) return;
    const partner = await db.query.referralAffiliates.findFirst({ where: eq(referralAffiliates.id, deal.referredByAffiliateId) });
    if (!partner) return;

    const visible = partnerStageFor(toStage);
    if (deal.partnerVisibleStage === visible) return;
    await db.update(deals).set({ partnerVisibleStage: visible }).where(eq(deals.id, dealId));
    await logPartnerEvent(partner.id, "stage_change", { from: deal.partnerVisibleStage, to: visible }, dealId);

    if (visible === "closed") {
      await ensurePayoutForClosedDeal(dealId);
      await recomputePayoutStatuses(partner.id);
    }
    if (partner.status !== "active") return;

    const fresh = (await db.query.deals.findFirst({ where: eq(deals.id, dealId) })) ?? deal;
    const where = escapeHtml(street(deal.propertyAddress));

    if (visible === "closed") {
      await sendClosedEmail(partner, fresh);
      return;
    }
    if (visible === "didnt_proceed") {
      await sendPartnerEmail(partner, {
        subject: `Update on your referral — ${street(deal.propertyAddress)}`,
        heading: "An update on your referral",
        bodyHtml:
          greeting(partner) +
          `<p style="margin:0 0 16px;">Your referral on ${where} isn't going to move forward this time. Thank you for sending it our way — your next referral is always welcome.</p>` +
          button("Open your portal", portalUrl()),
        dealId,
      });
      return;
    }

    const label = PARTNER_STAGE_LABELS[visible];
    await sendPartnerEmail(partner, {
      subject: `Your referral on ${street(deal.propertyAddress)} — ${label}`,
      heading: `Your referral moved to ${label}`,
      bodyHtml:
        greeting(partner) +
        `<p style="margin:0 0 16px;">Your referral on ${where} ${visible === "paused" ? "is now paused" : `moved to <strong>${escapeHtml(label)}</strong>`}.${visible === "paused" ? ` ${escapeHtml(PAUSED_MICROCOPY)}` : ""}</p>` +
        payoutLine(fresh, partner) +
        button("See it in your portal", portalUrl()),
      dealId,
    });
  } catch (err) {
    console.error("onDealStageChanged failed:", err);
  }
}

/**
 * Tells a partner a referral was credited to them by hand (a borrower who came in
 * without their link). Says where the deal stands right now rather than claiming it
 * just arrived. Only active partners are emailed; never throws.
 */
export async function notifyPartnerOfCreditedReferral(dealId: string): Promise<void> {
  try {
    const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
    if (!deal?.referredByAffiliateId) return;
    const partner = await db.query.referralAffiliates.findFirst({ where: eq(referralAffiliates.id, deal.referredByAffiliateId) });
    if (!partner || partner.status !== "active") return;

    const visible = partnerStageFor(deal.stage);
    if (visible === "closed") {
      await sendClosedEmail(partner, deal);
      return;
    }
    if (visible === "didnt_proceed") return;

    const label = PARTNER_STAGE_LABELS[visible];
    await sendPartnerEmail(partner, {
      subject: `A referral was added to your account — ${street(deal.propertyAddress)}`,
      heading: "A referral was added to your account",
      bodyHtml:
        greeting(partner) +
        `<p style="margin:0 0 16px;">${escapeHtml(deal.borrowerName)}'s request on ${escapeHtml(street(deal.propertyAddress))} has been credited to you as a referral. It's currently at <strong>${escapeHtml(label)}</strong>.</p>` +
        payoutLine(deal, partner) +
        `<p style="margin:0 0 16px;">You'll see every step it takes in your portal.</p>` +
        button("Open your portal", portalUrl()),
      dealId,
    });
  } catch (err) {
    console.error("notifyPartnerOfCreditedReferral failed:", err);
  }
}

async function sendClosedEmail(partner: Partner, deal: Deal): Promise<void> {
  const needsBanking = !partner.bankingReceivedAt;
  const needsW9 = !partner.w9ReceivedAt;
  const where = escapeHtml(street(deal.propertyAddress));

  if (needsBanking || needsW9) {
    if (!partner.bankingRequestedAt) {
      await db.update(referralAffiliates).set({ bankingRequestedAt: new Date() }).where(eq(referralAffiliates.id, partner.id));
    }
    await sendPartnerEmail(partner, {
      subject: `Your referral closed — add your payment details`,
      heading: "Your referral closed",
      bodyHtml:
        greeting(partner) +
        `<p style="margin:0 0 16px;">Your referral on ${where} closed. Add your payment details now — your payout goes out by ACH within 5 business days of our fee arriving from title. Wires land in days; mailed checks can take 2–3 weeks.</p>` +
        payoutLine(deal, partner) +
        `<p style="margin:0 0 16px;">Two quick things, both in your portal: ${needsBanking ? "add your payment details" : ""}${needsBanking && needsW9 ? " and " : ""}${needsW9 ? "complete your W-9" : ""}.</p>` +
        button("Add payment details", `${appUrl()}/partner/payment`),
      dealId: deal.id,
    });
    return;
  }

  await sendPartnerEmail(partner, {
    subject: `Your referral closed — ${street(deal.propertyAddress)}`,
    heading: "Your referral closed",
    bodyHtml:
      greeting(partner) +
      `<p style="margin:0 0 16px;">Your referral on ${where} closed. Your payment details and W-9 are on file, so your payout goes out by ACH within 5 business days of our fee arriving from title.</p>` +
      payoutLine(deal, partner) +
      button("See it in your portal", portalUrl()),
    dealId: deal.id,
  });
}
