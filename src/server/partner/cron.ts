import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { partnerBorrowers, referralAffiliates } from "@/server/db/schema";
import { evaluateTier, TIER_AT_RISK_DAYS } from "@/lib/partner-comp";
import { appUrl, button, greeting, notifyAdmins, sendPartnerEmail } from "@/server/partner/email";
import { createInviteToken } from "@/server/partner/invite";
import { logPartnerEvent } from "@/server/partner/events";

const DAY = 24 * 60 * 60 * 1000;
const ageDays = (d: Date | null, now: Date) => (d ? (now.getTime() - d.getTime()) / DAY : 0);

/** Day-2 and day-5 nudges for partners who were invited but haven't finished setting up. */
async function nudgeStalledSignups(now: Date) {
  const rows = await db.query.referralAffiliates.findMany({
    where: inArray(referralAffiliates.status, ["invited", "profile_complete"]),
  });
  let sent = 0;
  for (const p of rows) {
    const age = ageDays(p.portalInvitedAt, now);
    const which = age >= 5 && !p.inviteNudge2At ? 2 : age >= 2 && !p.inviteNudge1At ? 1 : 0;
    if (!which) continue;
    const link =
      p.status === "profile_complete" ? `${appUrl()}/partner/sign-in` : `${appUrl()}/partner/join/${await createInviteToken(p.id)}`;
    const ok = await sendPartnerEmail(p, {
      subject: which === 1 ? "Finish setting up your partner account" : "Your partner invite is still waiting",
      heading: "Your partner account is almost ready",
      bodyHtml:
        greeting(p) +
        `<p style="margin:0 0 16px;">${
          p.status === "profile_complete"
            ? "One last step — accept the partner terms and you can start referring."
            : "It takes about two minutes to set up your account, and then your referral link is ready to share."
        }</p>` +
        button(p.status === "profile_complete" ? "Accept terms" : "Set up your account", link),
    });
    await db
      .update(referralAffiliates)
      .set(which === 1 ? { inviteNudge1At: now } : { inviteNudge2At: now })
      .where(eq(referralAffiliates.id, p.id));
    await logPartnerEvent(p.id, "nudged", { nudge: which, sent: ok });
    if (ok) sent++;
  }
  return sent;
}

/** Day-3 and day-7 reminders after a referral closes while ACH details or the W-9 are still missing, then stop. */
async function remindPaymentDetails(now: Date) {
  const rows = await db.query.referralAffiliates.findMany({
    where: and(eq(referralAffiliates.status, "active"), sql`${referralAffiliates.bankingRequestedAt} is not null`),
  });
  let sent = 0;
  for (const p of rows) {
    if (p.bankingReceivedAt && p.w9ReceivedAt) continue;
    const age = ageDays(p.bankingRequestedAt, now);
    const which = age >= 7 && !p.bankingNudge7At ? 7 : age >= 3 && !p.bankingNudge3At ? 3 : 0;
    if (!which) continue;
    const missing = [!p.bankingReceivedAt && "your payment details", !p.w9ReceivedAt && "your W-9"].filter(Boolean).join(" and ");
    const ok = await sendPartnerEmail(p, {
      subject: "Your payout is waiting on one thing",
      heading: "Finish setting up your payout",
      bodyHtml:
        greeting(p) +
        `<p style="margin:0 0 16px;">Your referral closed, but we still need ${missing} before we can send your payout. It only takes a minute.</p>` +
        button("Add it now", `${appUrl()}/partner/payment`),
    });
    await db
      .update(referralAffiliates)
      .set(which === 3 ? { bankingNudge3At: now } : { bankingNudge7At: now })
      .where(eq(referralAffiliates.id, p.id));
    if (ok) sent++;
  }
  return sent;
}

/** Tells the admins once about active partners who haven't sent a referral in 45 days. */
async function flagQuietPartners(now: Date) {
  const rows = await db.query.referralAffiliates.findMany({
    where: eq(referralAffiliates.status, "active"),
    with: { deals: { columns: { createdAt: true } } },
  });
  let flagged = 0;
  for (const p of rows) {
    const lastActivity = Math.max(p.termsAcceptedAt?.getTime() ?? 0, ...p.deals.map((d) => d.createdAt.getTime()));
    if (!lastActivity || now.getTime() - lastActivity < 45 * DAY) continue;
    if (p.quietNotifiedAt && p.quietNotifiedAt.getTime() > lastActivity) continue;
    await db.update(referralAffiliates).set({ quietNotifiedAt: now }).where(eq(referralAffiliates.id, p.id));
    await logPartnerEvent(p.id, "quiet");
    await notifyAdmins({
      type: "partner_quiet",
      title: `${p.name ?? p.email} has gone quiet`,
      body: "No referral in 45+ days. A quick check-in might get the next one flowing.",
      href: "/settings/referrals",
    });
    flagged++;
  }
  return flagged;
}

/**
 * Tier review. A partner who earns 25% gets it right away; a drop is only
 * applied on the first of the month. The 90-day "at risk" heads-up is sent once.
 */
async function reviewTiers(now: Date) {
  const rows = await db.query.referralAffiliates.findMany({ where: inArray(referralAffiliates.status, ["active", "paused"]) });
  const yearAgo = new Date(now.getTime() - 365 * DAY);
  const firstOfMonth = now.getUTCDate() === 1;
  let changed = 0;
  for (const p of rows) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(partnerBorrowers)
      .where(and(eq(partnerBorrowers.partnerId, p.id), gte(partnerBorrowers.firstFundedAt, yearAgo)));
    const result = evaluateTier({ tier: p.tier, tierEarnedAt: p.tierEarnedAt, tierStickyUntil: p.tierStickyUntil }, n, now);

    if (result.change === "earned" || (result.change === "dropped" && firstOfMonth)) {
      await db
        .update(referralAffiliates)
        .set({ tier: result.tier, tierEarnedAt: result.tierEarnedAt, tierStickyUntil: result.tierStickyUntil, tierAtRiskNotifiedAt: null })
        .where(eq(referralAffiliates.id, p.id));
      await logPartnerEvent(p.id, "tier_change", { to: result.tier, firstDeals12mo: n });
      changed++;
      if (result.change === "earned") {
        await sendPartnerEmail(p, {
          subject: "You've reached the 25% partner tier",
          heading: "You earned the 25% tier",
          bodyHtml:
            greeting(p) +
            `<p style="margin:0 0 16px;">${n} of your referred borrowers have funded in the past year, so your payout on new first-time borrowers is now <strong>25%</strong> of our origination fee. Thank you.</p>` +
            button("See it in your portal", `${appUrl()}/partner`),
        });
      }
    } else if (result.atRisk && !p.tierAtRiskNotifiedAt) {
      await db.update(referralAffiliates).set({ tierAtRiskNotifiedAt: now }).where(eq(referralAffiliates.id, p.id));
      await logPartnerEvent(p.id, "tier_at_risk", { firstDeals12mo: n });
      await sendPartnerEmail(p, {
        subject: "Keep your 25% partner tier",
        heading: `Your 25% tier needs ${2 - n} more funded referral${2 - n === 1 ? "" : "s"}`,
        bodyHtml:
          greeting(p) +
          `<p style="margin:0 0 16px;">Your 25% tier runs for the next ${TIER_AT_RISK_DAYS} days or so. To keep it, two borrowers you referred need to have funded in the past year — you're at ${n}. Send someone our way and it's yours for another year.</p>` +
          button("Open your portal", `${appUrl()}/partner`),
      });
    }
  }
  return changed;
}

export async function runPartnerDailyJobs(now: Date = new Date()) {
  const signupNudges = await nudgeStalledSignups(now);
  const paymentReminders = await remindPaymentDetails(now);
  const quietFlagged = await flagQuietPartners(now);
  const tierChanges = await reviewTiers(now);
  return { signupNudges, paymentReminders, quietFlagged, tierChanges };
}
