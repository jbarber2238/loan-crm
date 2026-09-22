"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { deals, users } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { sendGmailAs } from "@/server/gmail/send";
import { getCompanyName, getCompanyLogoHtml } from "@/server/settings";
import { getUserEmailSignatureHtml } from "@/server/users";
import { getEmailRecipientCandidates } from "@/server/email-recipient-candidates";
import { buildAllDealTokens } from "@/server/deal-tokens";
import { renderTemplate } from "@/server/pricing-templates";
import { plainTextToHtmlWithBlocks } from "@/lib/email-html";
import { getOrCreateConversationForPhone } from "@/server/conversations";

async function introTokens(dealId: string, senderName: string) {
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) throw new Error("Deal not found");

  const companyName = await getCompanyName();
  const tokens = {
    ...(await buildAllDealTokens(deal)),
    senderName,
    companyName,
  };
  return { deal, tokens };
}

/** Renders (but does not send) the current user's own borrower intro email for this deal. */
export async function previewIntroEmail(dealId: string) {
  const user = await requireUser();

  const me = await db.query.users.findFirst({ where: eq(users.id, user.id) });
  if (!me?.borrowerIntroEmailSubject?.trim() || !me.borrowerIntroEmailBody?.trim()) {
    throw new Error("Set up your intro email first, in Settings → My Profile.");
  }

  const { deal, tokens } = await introTokens(dealId, user.name ?? "");
  if (!deal.borrowerEmail) throw new Error("This deal has no borrower email on file");

  const [signatureHtml, candidates] = await Promise.all([
    getUserEmailSignatureHtml(user.id),
    getEmailRecipientCandidates(dealId, { includeAllStaff: true }),
  ]);

  return {
    to: deal.borrowerEmail,
    cc: "",
    subject: renderTemplate(me.borrowerIntroEmailSubject, tokens),
    body: plainTextToHtmlWithBlocks(renderTemplate(me.borrowerIntroEmailBody, tokens), {}),
    signatureHtml,
    candidates,
  };
}

export async function sendIntroEmail(dealId: string, to: string, cc: string, subject: string, body: string) {
  const user = await requireUser();
  if (!user.email) throw new Error("Your account has no email on file");
  if (!to.trim()) throw new Error("No recipient on file for this email");
  if (!subject.trim() || !body.trim()) throw new Error("Subject and body can't be empty");

  const [logoHtml, signatureHtml] = await Promise.all([getCompanyLogoHtml(), getUserEmailSignatureHtml(user.id)]);
  await sendGmailAs(user.id, user.email, {
    to: to.trim(),
    cc: cc.trim() || null,
    subject,
    body: logoHtml + body + signatureHtml,
    html: true,
  });

  revalidatePath(`/deals/${dealId}`);
}

/**
 * Opens (creating if needed) the borrower's conversation and renders the
 * current user's own intro text into it — the chat dock's own Send button
 * does the actual sending, same as picking someone from "New message" does.
 */
export async function prepareIntroText(dealId: string) {
  const user = await requireUser();

  const me = await db.query.users.findFirst({ where: eq(users.id, user.id) });
  if (!me?.borrowerIntroTextBody?.trim()) {
    throw new Error("Set up your intro text first, in Settings → My Profile.");
  }

  const { deal, tokens } = await introTokens(dealId, user.name ?? "");
  if (!deal.borrowerPhone) throw new Error("This deal has no borrower phone on file");

  const conversation = await getOrCreateConversationForPhone(deal.borrowerPhone, dealId);

  return {
    conversationId: conversation.id,
    contactName: deal.borrowerName,
    contactPhone: conversation.primaryPhone,
    body: renderTemplate(me.borrowerIntroTextBody, tokens),
  };
}
