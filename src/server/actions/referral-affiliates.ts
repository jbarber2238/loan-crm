"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { affiliatePaymentDocuments, deals, referralAffiliates, users } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { sendGmailAs } from "@/server/gmail/send";
import { getCompanyName, getCompanyLogoHtml } from "@/server/settings";
import { getUserEmailSignatureHtml } from "@/server/users";
import { htmlButton } from "@/lib/email-html";
import { isPgErrorCode } from "@/lib/pg-error";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB, matches the borrower-upload limit

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
        <p>Complete your quick sign-up to get your own referral link — it takes less than a minute.</p>
        <p>${htmlButton("Complete your sign-up", `${appUrl}/affiliate/${affiliate.id}`)}</p>
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
    if (isPgErrorCode(err, "23503")) {
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
          <p>Here's what we have on file for you:</p>
          <p>
            Name: ${name.trim()}<br />
            Phone: ${phone.trim()}<br />
            Email: ${email.trim().toLowerCase()}
          </p>
          <p>And here's your own personal referral link — anyone who submits a deal through it is automatically tracked as your referral:</p>
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

// Shared by every affiliate lifecycle email below — same shape sendGmailAs
// needs, best-effort (a failed send never blocks the deal action that
// triggered it).
async function sendAffiliateEmail(affiliateInvitedByUserId: string, affiliateInvitedByEmail: string | null, to: string, subject: string, bodyHtml: string) {
  if (!affiliateInvitedByEmail) return;
  const [companyName, logoHtml, signatureHtml] = await Promise.all([
    getCompanyName(),
    getCompanyLogoHtml(),
    getUserEmailSignatureHtml(affiliateInvitedByUserId),
  ]);
  await sendGmailAs(affiliateInvitedByUserId, affiliateInvitedByEmail, {
    to,
    subject: subject.replace("{company}", companyName),
    body: logoHtml + bodyHtml + signatureHtml,
    html: true,
  });
}

// Fires once, immediately, the moment a deal comes in through an affiliate's
// referral link — regardless of fee eligibility, since this is just letting
// them know activity happened, not a payment notice.
export async function notifyAffiliateOfNewDeal(dealId: string) {
  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    with: { referredByAffiliate: { with: { invitedBy: true } } },
  });
  if (!deal?.referredByAffiliate) return;
  const affiliate = deal.referredByAffiliate;

  const body = `
    <p>A deal was submitted to your referral link.</p>
    <p>
      Borrower: ${deal.borrowerName}<br />
      Property: ${deal.propertyAddress}
    </p>
    <p>We'll keep you posted as it moves forward.</p>
  `;
  await sendAffiliateEmail(affiliate.invitedByUserId, affiliate.invitedBy.email, affiliate.email, "A deal was submitted to your referral link", body);
}

// Fires at most once per deal per stage — "application" and "lost" are pure
// status updates; "closed" is the one that actually asks for payment info,
// and only when the deal is still fee-eligible (see the no-perpetual-
// referrals rule in createDealFromIntake).
export async function notifyAffiliateOfStageChange(dealId: string, newStage: string) {
  if (newStage !== "application" && newStage !== "closed" && newStage !== "lost") return;

  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    with: { referredByAffiliate: { with: { invitedBy: true } } },
  });
  if (!deal?.referredByAffiliate) return;
  const affiliate = deal.referredByAffiliate;

  if (newStage === "application") {
    if (deal.referralApplicationEmailSentAt) return;
    const body = `
      <p>Good news — ${deal.borrowerName} has decided to move forward with a loan on ${deal.propertyAddress}.</p>
      <p>We'll let you know as soon as it closes.</p>
    `;
    await sendAffiliateEmail(affiliate.invitedByUserId, affiliate.invitedBy.email, affiliate.email, "Your referral is moving forward", body);
    await db.update(deals).set({ referralApplicationEmailSentAt: new Date() }).where(eq(deals.id, dealId));
    return;
  }

  if (newStage === "lost") {
    if (deal.referralLostEmailSentAt) return;
    const body = `
      <p>Unfortunately, this deal is no longer moving forward.</p>
      <p>
        Borrower: ${deal.borrowerName}<br />
        Property: ${deal.propertyAddress}
      </p>
    `;
    await sendAffiliateEmail(affiliate.invitedByUserId, affiliate.invitedBy.email, affiliate.email, "Update on your referral", body);
    await db.update(deals).set({ referralLostEmailSentAt: new Date() }).where(eq(deals.id, dealId));
    return;
  }

  // closed
  if (deal.referralClosedEmailSentAt || !deal.referralFeeEligible) return;
  const uploadToken = await getOrCreateWireUploadToken(affiliate.id);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const body = `
    <p>Great news — the deal you referred for ${deal.borrowerName} at ${deal.propertyAddress} has officially closed!</p>
    <p>To get your referral fee sent out, please upload your ACH or wire instructions.</p>
    <p>${htmlButton("Upload payment info", `${appUrl}/affiliate-payment-upload/${uploadToken}`)}</p>
    <p>Once we have it on file, we'll get your payment issued.</p>
  `;
  await sendAffiliateEmail(affiliate.invitedByUserId, affiliate.invitedBy.email, affiliate.email, "Your referral closed — send us your payment info", body);
  await db.update(deals).set({ referralClosedEmailSentAt: new Date() }).where(eq(deals.id, dealId));
}

async function getOrCreateWireUploadToken(affiliateId: string): Promise<string> {
  const affiliate = await db.query.referralAffiliates.findFirst({
    where: eq(referralAffiliates.id, affiliateId),
    columns: { wireInstructionsUploadToken: true },
  });
  if (affiliate?.wireInstructionsUploadToken) return affiliate.wireInstructionsUploadToken;

  const token = crypto.randomUUID();
  await db.update(referralAffiliates).set({ wireInstructionsUploadToken: token }).where(eq(referralAffiliates.id, affiliateId));
  return token;
}

// Public — no auth. One-way: this is the only code path that can ever write
// to affiliatePaymentDocuments, and there is deliberately no matching
// read/list/download action exposed anywhere in the public app — only the
// authenticated admin Settings page can read these rows back.
export async function uploadAffiliatePaymentInfo(token: string, formData: FormData) {
  const affiliate = await db.query.referralAffiliates.findFirst({
    where: eq(referralAffiliates.wireInstructionsUploadToken, token),
  });
  if (!affiliate) throw new Error("This upload link isn't valid.");

  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) throw new Error("Choose a file to upload");

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`${file.name} is larger than 15MB — please upload a smaller file`);
    }
  }

  for (const file of files) {
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    await db.insert(affiliatePaymentDocuments).values({
      affiliateId: affiliate.id,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
      data,
    });
  }

  revalidatePath("/settings/referrals");
}
