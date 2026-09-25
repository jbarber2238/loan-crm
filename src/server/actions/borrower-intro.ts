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
import { labelFor, LOAN_CATEGORIES } from "@/lib/labels";

// Used when the processor hasn't set up her own template yet — she can still
// preview, edit, add recipients, and send; her template just replaces this.
function defaultIntro(deal: { borrowerName: string; propertyAddress: string; loanCategory: string }, senderName: string) {
  const first = deal.borrowerName.trim().split(/\s+/)[0] || deal.borrowerName;
  const loanType = labelFor(LOAN_CATEGORIES, deal.loanCategory);
  return {
    subject: `Introduction — ${deal.propertyAddress}`,
    email: `Hi ${first},\n\nMy name is ${senderName} and I'll be your loan processor on your ${loanType} loan for ${deal.propertyAddress}.\n\nI'll be reaching out as we gather the documents we need to move your file forward. Please reply here or call me with any questions.`,
    text: `Hi ${first}, this is ${senderName}, your loan processor for ${deal.propertyAddress}. I'll be reaching out shortly about the documents we need. Feel free to text me any questions!`,
  };
}

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
  const hasTemplate = Boolean(me?.borrowerIntroEmailSubject?.trim() && me?.borrowerIntroEmailBody?.trim());

  const { deal, tokens } = await introTokens(dealId, user.name ?? "");

  const [signatureHtml, candidates] = await Promise.all([
    getUserEmailSignatureHtml(user.id),
    getEmailRecipientCandidates(dealId, { includeAllStaff: true }),
  ]);

  const loanOfficer = await db.query.users.findFirst({ where: eq(users.id, deal.assignedLoanOfficerId) });
  const loanOfficerEmail =
    loanOfficer?.email && loanOfficer.email.toLowerCase() !== deal.borrowerEmail?.toLowerCase() ? loanOfficer.email : "";

  const fallback = defaultIntro(deal, user.name ?? "your loan processor");
  return {
    // Left blank (not an error) when the deal has no borrower email, so the
    // processor can type one in — server-action errors are masked in
    // production, which made expected cases like this look like crashes.
    to: deal.borrowerEmail ?? "",
    // The deal's loan officer is always copied on intro emails by default
    // (removable in the dialog), so they see exactly what the borrower got.
    cc: loanOfficerEmail,
    subject: hasTemplate ? renderTemplate(me!.borrowerIntroEmailSubject!, tokens) : fallback.subject,
    body: plainTextToHtmlWithBlocks(
      hasTemplate ? renderTemplate(me!.borrowerIntroEmailBody!, tokens) : fallback.email,
      {}
    ),
    signatureHtml,
    candidates,
    usedDefaultTemplate: !hasTemplate,
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

  const { deal, tokens } = await introTokens(dealId, user.name ?? "");
  if (!deal.borrowerPhone) throw new Error("This deal has no borrower phone on file");

  const conversation = await getOrCreateConversationForPhone(deal.borrowerPhone, dealId);

  return {
    conversationId: conversation.id,
    contactName: deal.borrowerName,
    contactPhone: conversation.primaryPhone,
    body: me?.borrowerIntroTextBody?.trim()
      ? renderTemplate(me.borrowerIntroTextBody, tokens)
      : defaultIntro(deal, user.name ?? "your loan processor").text,
  };
}
