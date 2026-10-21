import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { leads, partnerBorrowers, partnerEvents, referralAffiliates, users } from "@/server/db/schema";
import { evaluateTier, TIER_AT_RISK_DAYS } from "@/lib/partner-comp";
import { appUrl, button, greeting, notifyAdmins, sendPartnerEmail } from "@/server/partner/email";
import { createInviteToken, getInviteSettings, sendInviteTemplate } from "@/server/partner/invite";
import { nextDueStep, reminderTemplateKey } from "@/lib/partner-invite-cadence";
import { logPartnerEvent } from "@/server/partner/events";

const DAY = 24 * 60 * 60 * 1000;
const ageDays = (d: Date | null, now: Date) => (d ? (now.getTime() - d.getTime()) / DAY : 0);

/**
 * Reminders for partners who were invited but haven't finished setting up,
 * on the schedule in Settings → Referrals (default days 2, 5, 9, 14) and
 * stopping when the invite expires. Each reminder is an editable template.
 */
async function nudgeStalledSignups(now: Date) {
  const { reminderDays, expiresDays } = await getInviteSettings();
  const rows = await db.query.referralAffiliates.findMany({
    where: inArray(referralAffiliates.status, ["invited", "profile_complete"]),
  });
  let sent = 0;
  for (const p of rows) {
    if (!p.portalInvitedAt) continue;
    // People who came through the Friday Zoom get their own follow-up and nudge from that sequence.
    const fridayLead = await db.query.leads.findFirst({
      where: and(eq(leads.email, p.email), sql`${leads.fridayBookedSessionDate} is not null`),
      columns: { id: true },
    });
    if (fridayLead) continue;

    // Steps already handled since this invite (or its latest re-send) went out.
    const events = await db.query.partnerEvents.findMany({
      where: and(eq(partnerEvents.partnerId, p.id), eq(partnerEvents.type, "nudged"), gte(partnerEvents.createdAt, p.portalInvitedAt)),
    });
    const handled = new Set(events.map((e) => Number(e.payload?.step)).filter((n) => Number.isInteger(n)));
    const { due, skipped } = nextDueStep(ageDays(p.portalInvitedAt, now), reminderDays, handled, expiresDays);
    for (const step of skipped) await logPartnerEvent(p.id, "nudged", { step, sent: false, skipped: true });
    if (!due) continue;

    const expiresAt = new Date(p.portalInvitedAt.getTime() + expiresDays * DAY);
    const afterTerms = p.status === "profile_complete";
    const setupUrl = afterTerms ? `${appUrl()}/partner/sign-in` : `${appUrl()}/partner/join/${await createInviteToken(p.id, expiresAt)}`;
    const inviter = await db.query.users.findFirst({ where: eq(users.id, p.invitedByUserId), columns: { name: true } });
    const ok = await sendInviteTemplate(p, reminderTemplateKey(due, reminderDays.length), {
      inviterName: inviter?.name ?? null,
      setupUrl,
      setupLabel: afterTerms ? "Accept the terms" : "Set up your partner account",
      expiresAt,
    });
    await logPartnerEvent(p.id, "nudged", { step: due, of: reminderDays.length, sent: ok });
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
