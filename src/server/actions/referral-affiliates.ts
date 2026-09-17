"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { deals, referralAffiliates, users } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { sendGmailAs } from "@/server/gmail/send";
import { getCompanyName, getCompanyLogoHtml } from "@/server/settings";
import { getUserEmailSignatureHtml } from "@/server/users";

// Referral links always route to this one loan officer regardless of who
// invited the affiliate — the only one this brokerage has today. Revisit if
// there's ever more than one and referrals need to be split between them.
export async function getDefaultLoanOfficerId(): Promise<string | null> {
  const loanOfficer = await db.query.users.findFirst({
    where: eq(users.baseRole, "loan_officer"),
    orderBy: (u, { asc }) => asc(u.createdAt),
  });
  return loanOfficer?.id ?? null;
}

export async function inviteAffiliate(formData: FormData) {
  const admin = await requireAdmin();

  const email = formData.get("email");
  if (typeof email !== "string" || !email.trim()) {
    throw new Error("Email is required");
  }
  const normalizedEmail = email.trim().toLowerCase();

  const existing = await db.query.referralAffiliates.findFirst({
    where: eq(referralAffiliates.email, normalizedEmail),
  });
  if (existing) {
    throw new Error("An affiliate with that email already exists.");
  }

  const [affiliate] = await db
    .insert(referralAffiliates)
    .values({ email: normalizedEmail, invitedByUserId: admin.id })
    .returning({ id: referralAffiliates.id });

  if (admin.email) {
    try {
      const appUrl = process.env.APP_URL ?? "http://localhost:3000";
      const [companyName, logoHtml, signatureHtml] = await Promise.all([
        getCompanyName(),
        getCompanyLogoHtml(),
        getUserEmailSignatureHtml(admin.id),
      ]);
      const body = `
        <p>Hi,</p>
        <p>${admin.name ?? "Our team"} invited you to join ${companyName}'s referral program.</p>
        <p>
          <a href="${appUrl}/affiliate/${affiliate.id}">Complete your quick sign-up here</a> to get your own
          referral link — it takes less than a minute.
        </p>
      `;
      await sendGmailAs(admin.id, admin.email, {
        to: normalizedEmail,
        subject: `You've been invited to ${companyName}'s referral program`,
        body: logoHtml + body + signatureHtml,
        html: true,
      });
    } catch (err) {
      console.error("Failed to send affiliate invite email:", err);
    }
  }

  revalidatePath("/settings/referrals");
}

// Hard delete — same reasoning as deleteUser: a pending invite or an
// affiliate with no referred deals has nothing to protect, and one with
// real deals is protected by the foreign-key reference from those deals.
export async function deleteAffiliate(affiliateId: string) {
  await requireAdmin();

  try {
    await db.delete(referralAffiliates).where(eq(referralAffiliates.id, affiliateId));
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "23503") {
      throw new Error("Can't remove — this affiliate has referred deals on file.");
    }
    throw err;
  }

  revalidatePath("/settings/referrals");
}

// Public — no auth. The affiliate themselves fills this in from the emailed
// invite link, before they're anything more than an email address in our
// system.
export async function completeAffiliateSignup(affiliateId: string, formData: FormData) {
  const affiliate = await db.query.referralAffiliates.findFirst({
    where: eq(referralAffiliates.id, affiliateId),
    with: { invitedBy: true },
  });
  if (!affiliate) throw new Error("This referral sign-up link isn't valid.");

  const name = formData.get("name");
  const phone = formData.get("phone");
  const email = formData.get("email");
  if (typeof name !== "string" || !name.trim()) throw new Error("Name is required");
  if (typeof phone !== "string" || !phone.trim()) throw new Error("Phone is required");
  if (typeof email !== "string" || !email.trim()) throw new Error("Email is required");

  const wasAlreadyCompleted = Boolean(affiliate.completedAt);

  await db
    .update(referralAffiliates)
    .set({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim().toLowerCase(),
      completedAt: affiliate.completedAt ?? new Date(),
    })
    .where(eq(referralAffiliates.id, affiliateId));

  // Only send the welcome email the first time they complete the form —
  // resubmitting to update their info shouldn't re-send it.
  if (!wasAlreadyCompleted && affiliate.invitedBy.email) {
    try {
      const loanOfficerId = await getDefaultLoanOfficerId();
      if (loanOfficerId) {
        const appUrl = process.env.APP_URL ?? "http://localhost:3000";
        const embedOrigin = "https://mannalendingco.com";
        const intakeLink = `${appUrl}/intake/${loanOfficerId}?aff=${affiliateId}`;
        const embedSrc = `${embedOrigin}/embed/intake/${loanOfficerId}?aff=${affiliateId}`;
        const embedSnippet = `&lt;iframe src="${embedSrc}" style="width:100%;max-width:720px;height:2200px;border:none;" title="Loan Inquiry"&gt;&lt;/iframe&gt;`;
        const [companyName, logoHtml, signatureHtml] = await Promise.all([
          getCompanyName(),
          getCompanyLogoHtml(),
          getUserEmailSignatureHtml(affiliate.invitedByUserId),
        ]);
        const body = `
          <p>Welcome to our affiliate program!</p>
          <p>Here's your own personal referral link — anyone who submits a deal through it is automatically tracked as your referral:</p>
          <p><a href="${intakeLink}">${intakeLink}</a></p>
          <p>If you'd rather embed it directly on your own website, here's the embed code:</p>
          <p><code>${embedSnippet}</code></p>
        `;
        await sendGmailAs(affiliate.invitedByUserId, affiliate.invitedBy.email, {
          to: email.trim().toLowerCase(),
          subject: `Welcome to ${companyName}'s affiliate program`,
          body: logoHtml + body + signatureHtml,
          html: true,
        });
      }
    } catch (err) {
      console.error("Failed to send affiliate welcome email:", err);
    }
  }

  revalidatePath("/settings/referrals");
}

export async function markReferralFeePaid(dealId: string) {
  await requireAdmin();

  await db.update(deals).set({ referralFeePaidAt: new Date() }).where(eq(deals.id, dealId));

  revalidatePath(`/deals/${dealId}`);
}
