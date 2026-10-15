"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/server/db/client";
import { fail } from "@/lib/action-result";
import { affiliatePaymentDocuments, partnerTokens, referralAffiliates } from "@/server/db/schema";
import { appUrl, button, greeting, notifyAdmins, sendPartnerEmail } from "@/server/partner/email";
import { logPartnerEvent } from "@/server/partner/events";
import { encryptSecret, hashToken, newToken } from "@/server/partner/crypto";
import { hashPassword, verifyPassword } from "@/server/partner/password";
import { createPartnerSession, destroyPartnerSession, requirePartner } from "@/server/partner/session";
import { recomputePayoutStatuses } from "@/server/partner/payouts";
import {
  LOCKOUT_MINUTES,
  LOGIN_LINK_MINUTES,
  MAX_FAILED_LOGINS,
  MIN_PASSWORD_LENGTH,
  PARTNER_TYPES,
  W9_TEMPLATE_UUID,
  isValidRoutingNumber,
} from "@/lib/partner-constants";
import { TERMS_VERSION } from "@/lib/partner-terms";
import {
  createDocumentFromTemplate,
  createSigningSessionUrl,
  getTemplateFirstRole,
  sendDocumentSilently,
  waitUntilDraft,
} from "@/server/pandadoc";

const MAX_FILE_SIZE = 15 * 1024 * 1024;

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

async function findValidToken(token: string, purpose: "invite" | "login") {
  return db.query.partnerTokens.findFirst({
    where: and(
      eq(partnerTokens.tokenHash, hashToken(token)),
      eq(partnerTokens.purpose, purpose),
      isNull(partnerTokens.usedAt),
      gt(partnerTokens.expiresAt, new Date())
    ),
  });
}

/** Validates an invite link and returns the partner it belongs to (for rendering the wizard). */
export async function getInvitePartner(token: string) {
  const row = await findValidToken(token, "invite");
  if (!row) return null;
  const partner = await db.query.referralAffiliates.findFirst({ where: eq(referralAffiliates.id, row.partnerId) });
  return partner ? { id: partner.id, email: partner.email, name: partner.name } : null;
}

// ---- Wizard: profile, then terms -------------------------------------------

export async function completePartnerProfile(token: string, formData: FormData) {
  const row = await findValidToken(token, "invite");
  if (!row) return fail("This sign-up link has expired. Ask us to send you a new one.");
  const partner = await db.query.referralAffiliates.findFirst({ where: eq(referralAffiliates.id, row.partnerId) });
  if (!partner) return fail("This sign-up link isn't valid.");

  const name = str(formData, "name");
  const phone = str(formData, "phone");
  const entity = str(formData, "entity");
  const partnerType = str(formData, "partnerType");
  const mailingAddress = str(formData, "mailingAddress");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  if (!name || !phone || !entity || !mailingAddress) return fail("Please fill in every field.");
  if (!PARTNER_TYPES.some((t) => t.value === partnerType)) return fail("Choose what type of partner you are.");
  if (password.length < MIN_PASSWORD_LENGTH) return fail(`Your password needs at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (password !== confirm) return fail("Those passwords don't match.");

  await db
    .update(referralAffiliates)
    .set({
      name,
      phone,
      entity,
      partnerType,
      mailingAddress,
      passwordHash: await hashPassword(password),
      status: partner.status === "active" ? "active" : "profile_complete",
      completedAt: partner.completedAt ?? new Date(),
      failedLogins: 0,
      lockedUntil: null,
    })
    .where(eq(referralAffiliates.id, partner.id));
  await db.update(partnerTokens).set({ usedAt: new Date() }).where(eq(partnerTokens.id, row.id));
  await logPartnerEvent(partner.id, "profile_completed");

  await createPartnerSession(partner.id);
  redirect("/partner/terms");
}

export async function acceptPartnerTerms(formData: FormData) {
  const partner = await requirePartner({ allowTermsPending: true });
  if (formData.get("accept") !== "on") return fail("Check the box to accept the terms.");
  const firstTime = partner.status !== "active";

  await db
    .update(referralAffiliates)
    .set({ termsVersion: TERMS_VERSION, termsAcceptedAt: new Date(), status: partner.status === "paused" ? "paused" : "active" })
    .where(eq(referralAffiliates.id, partner.id));
  await logPartnerEvent(partner.id, "signed", { version: TERMS_VERSION });

  if (firstTime) {
    await notifyAdmins({
      type: "partner_terms_accepted",
      title: `${partner.name ?? partner.email} accepted terms — partner active`,
      href: "/settings/referrals",
    });
  }
  redirect("/partner");
}

// ---- Sign in / out ----------------------------------------------------------

export async function partnerSignIn(formData: FormData) {
  const email = str(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const generic = "That email and password don't match. You can email yourself a sign-in link instead.";

  const partner = email ? await db.query.referralAffiliates.findFirst({ where: eq(referralAffiliates.email, email) }) : undefined;
  if (!partner || !partner.passwordHash) {
    await verifyPassword(password, "scrypt$00$00"); // keep timing similar
    return fail(generic);
  }
  if (partner.lockedUntil && partner.lockedUntil > new Date()) {
    return fail("Too many attempts. Try again in a few minutes, or email yourself a sign-in link.");
  }
  if (!(await verifyPassword(password, partner.passwordHash))) {
    const failed = partner.failedLogins + 1;
    await db
      .update(referralAffiliates)
      .set(
        failed >= MAX_FAILED_LOGINS
          ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) }
          : { failedLogins: failed }
      )
      .where(eq(referralAffiliates.id, partner.id));
    return fail(generic);
  }
  await db.update(referralAffiliates).set({ failedLogins: 0, lockedUntil: null }).where(eq(referralAffiliates.id, partner.id));
  await createPartnerSession(partner.id);
  redirect("/partner");
}

/** The forgot-password path: a single-use, 15-minute sign-in link. Always answers the same way. */
export async function requestPartnerSignInLink(formData: FormData) {
  const email = str(formData, "email").toLowerCase();
  const partner = email ? await db.query.referralAffiliates.findFirst({ where: eq(referralAffiliates.email, email) }) : undefined;
  if (partner && partner.passwordHash) {
    const token = newToken();
    await db.insert(partnerTokens).values({
      partnerId: partner.id,
      purpose: "login",
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + LOGIN_LINK_MINUTES * 60 * 1000),
    });
    await sendPartnerEmail(partner, {
      subject: "Your Manna Lending sign-in link",
      heading: "Your sign-in link",
      bodyHtml:
        greeting(partner) +
        `<p style="margin:0 0 16px;">Click below to sign in to your partner portal. The link works once and expires in ${LOGIN_LINK_MINUTES} minutes.</p>` +
        button("Sign in", `${appUrl()}/partner/link/${token}`) +
        `<p style="margin:0;color:#6b7280;font-size:12px;">If you didn't ask for this, you can ignore it.</p>`,
    });
  }
  return { ok: true };
}

export async function partnerSignOut() {
  await destroyPartnerSession();
  redirect("/partner/sign-in");
}

// ---- Banking, W-9 -------------------------------------------------------------

async function afterBankingReceived(partnerId: string, how: string) {
  const partner = await db.query.referralAffiliates.findFirst({ where: eq(referralAffiliates.id, partnerId) });
  if (!partner) return;
  await logPartnerEvent(partnerId, "banking_submitted", { how });
  await recomputePayoutStatuses(partnerId);
  await notifyAdmins({
    type: "partner_banking_submitted",
    title: `${partner.name ?? partner.email} submitted banking details`,
    href: "/settings/referrals",
  });
  await sendPartnerEmail(partner, {
    subject: "We received your payment details",
    heading: "Payment details received",
    bodyHtml:
      greeting(partner) +
      `<p style="margin:0 0 16px;">Thanks — your payment details are on file (we can't show them back to you, for your security). Your payout goes out by ACH within 5 business days of our fee arriving from title.</p>` +
      button("See your portal", `${appUrl()}/partner`),
  });
  revalidatePath("/partner");
  revalidatePath("/partner/payment");
}

export async function submitPartnerBanking(formData: FormData) {
  const partner = await requirePartner();
  const accountHolder = str(formData, "accountHolder");
  const routing = str(formData, "routing").replace(/\s/g, "");
  const account = str(formData, "account").replace(/\s/g, "");
  const accountType = str(formData, "accountType");
  if (!accountHolder) return fail("Enter the name on the account.");
  if (!isValidRoutingNumber(routing)) return fail("That routing number doesn't look right — it should be 9 digits.");
  if (!/^\d{4,17}$/.test(account)) return fail("The account number should be 4 to 17 digits.");
  if (accountType !== "checking" && accountType !== "savings") return fail("Choose checking or savings.");

  await db
    .update(referralAffiliates)
    .set({
      bankingEncrypted: encryptSecret(JSON.stringify({ accountHolder, routing, account, accountType })),
      bankingLast4: account.slice(-4),
      bankingAccountType: accountType,
      bankingReceivedAt: new Date(),
    })
    .where(eq(referralAffiliates.id, partner.id));
  await afterBankingReceived(partner.id, "form");
}

export async function uploadPartnerBankingDocument(formData: FormData) {
  const partner = await requirePartner();
  const file = formData.get("file");
  const kind = str(formData, "kind") === "voided_check" ? "Voided check" : "ACH instructions";
  if (!(file instanceof File) || file.size === 0) return fail("Choose a file to upload.");
  if (file.size > MAX_FILE_SIZE) return fail("That file is over 15MB — please upload a smaller one.");

  await db.insert(affiliatePaymentDocuments).values({
    affiliateId: partner.id,
    fileName: `${kind} — ${file.name}`,
    mimeType: file.type || "application/octet-stream",
    fileSize: file.size,
    data: Buffer.from(await file.arrayBuffer()).toString("base64"),
  });
  await db.update(referralAffiliates).set({ bankingReceivedAt: partner.bankingReceivedAt ?? new Date() }).where(eq(referralAffiliates.id, partner.id));
  await afterBankingReceived(partner.id, kind);
}

/** Starts the W-9 click-to-fill in PandaDoc and returns the page to open. */
export async function startPartnerW9(): Promise<{ url: string } | { error: string }> {
  const partner = await requirePartner();
  if (partner.w9ReceivedAt) return fail("Your W-9 is already on file.");
  const [first, ...rest] = (partner.name ?? "Partner").split(/\s+/);

  let documentId = partner.w9DocumentId;
  if (!documentId) {
    const role = (await getTemplateFirstRole(W9_TEMPLATE_UUID)) ?? "Client";
    const doc = await createDocumentFromTemplate({
      templateUuid: W9_TEMPLATE_UUID,
      name: `W-9 — ${partner.name ?? partner.email}`,
      recipientEmail: partner.email,
      recipientFirstName: first,
      recipientLastName: rest.join(" ") || first,
      role,
    });
    await waitUntilDraft(doc.id);
    await sendDocumentSilently(doc.id);
    documentId = doc.id;
    await db.update(referralAffiliates).set({ w9DocumentId: documentId }).where(eq(referralAffiliates.id, partner.id));
  }
  return { url: await createSigningSessionUrl(documentId, partner.email) };
}
