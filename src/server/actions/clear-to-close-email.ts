"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { dealNotes, deals } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { fail, type ActionError } from "@/lib/action-result";
import { sendGmailAs, getGmailAuthForUser, GmailNotConnectedError } from "@/server/gmail/send";
import { getCompanyName, getCompanyLogoHtml } from "@/server/settings";
import { getUserEmailSignatureHtml } from "@/server/users";
import { buildBorrowerEmail } from "@/server/borrower-templates";
import {
  CTC_ALREADY_ANSWERED,
  CTC_NOT_WAITING,
  buildTitleContactBlock,
  clearToCloseEmailPending,
  CLEAR_TO_CLOSE_TEMPLATE_KEY,
} from "@/lib/clear-to-close-email";

// The Clear to Close announcement is a yes/no question to staff, never an automatic send: a deal
// dropped into Clear to Close by mistake must not email the borrower. It goes out from the deal's
// assigned loan officer's own Gmail, whoever on the team answers "yes".

async function loadDeal(dealId: string) {
  return db.query.deals.findFirst({ where: eq(deals.id, dealId), with: { assignedLoanOfficer: true } });
}

async function renderEmail(deal: NonNullable<Awaited<ReturnType<typeof loadDeal>>>) {
  const loanOfficer = deal.assignedLoanOfficer!;
  const companyName = await getCompanyName();
  const { subject, body } = await buildBorrowerEmail(CLEAR_TO_CLOSE_TEMPLATE_KEY, deal, {
    assignedLoanOfficerName: loanOfficer.name ?? "",
    companyName,
    senderName: loanOfficer.name ?? "",
    extra: { titleContactBlock: buildTitleContactBlock(deal) },
  });
  const [logoHtml, signatureHtml] = await Promise.all([getCompanyLogoHtml(), getUserEmailSignatureHtml(loanOfficer.id)]);
  return { subject, html: logoHtml + body + signatureHtml };
}

function problemWith(deal: Awaited<ReturnType<typeof loadDeal>>): string | null {
  if (!deal) return "Deal not found.";
  if (deal.clearToCloseEmailStatus) return CTC_ALREADY_ANSWERED;
  if (!clearToCloseEmailPending(deal)) return CTC_NOT_WAITING;
  if (!deal.assignedLoanOfficer?.email) return "Assign a loan officer to this deal first. The email goes out from them.";
  return null;
}

export type ClearToCloseEmailPreview = {
  subject: string;
  html: string;
  to: string;
  fromName: string;
  fromEmail: string;
};

/** What the borrower would receive, so staff can read it before answering yes or no. */
export async function previewClearToCloseEmail(dealId: string): Promise<ClearToCloseEmailPreview | ActionError> {
  await requireUser();
  const deal = await loadDeal(dealId);
  const problem = problemWith(deal);
  if (problem || !deal) return fail(problem ?? "Deal not found.");
  try {
    const { subject, html } = await renderEmail(deal);
    return {
      subject,
      html,
      to: deal.borrowerEmail!,
      fromName: deal.assignedLoanOfficer!.name ?? deal.assignedLoanOfficer!.email!,
      fromEmail: deal.assignedLoanOfficer!.email!,
    };
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Couldn't build that email.");
  }
}

/** "Yes": sends the email (re-rendered here, never taken from the browser) and records the answer. */
export async function sendClearToCloseEmail(dealId: string): Promise<{ sent: true } | ActionError> {
  const user = await requireUser();
  const deal = await loadDeal(dealId);
  const problem = problemWith(deal);
  if (problem || !deal) return fail(problem ?? "Deal not found.");
  const loanOfficer = deal.assignedLoanOfficer!;

  // Claim the answer first so a double-click can't send twice; give it back if the send fails.
  const [claimed] = await db
    .update(deals)
    .set({ clearToCloseEmailStatus: "sent", clearToCloseEmailAt: new Date() })
    .where(and(eq(deals.id, dealId), isNull(deals.clearToCloseEmailStatus), eq(deals.stage, "clear_to_close")))
    .returning({ id: deals.id });
  if (!claimed) return fail(CTC_ALREADY_ANSWERED);

  try {
    await getGmailAuthForUser(loanOfficer.id);
    const { subject, html } = await renderEmail(deal);
    await sendGmailAs(loanOfficer.id, loanOfficer.email!, {
      to: deal.borrowerEmail!,
      subject,
      body: html,
      html: true,
      dealId,
      category: "borrower_clear_to_close",
    });
  } catch (err) {
    await db
      .update(deals)
      .set({ clearToCloseEmailStatus: null, clearToCloseEmailAt: null })
      .where(eq(deals.id, dealId));
    if (err instanceof GmailNotConnectedError) {
      return fail(`${loanOfficer.name ?? "The loan officer"} hasn't connected Gmail yet, so the email can't go out from them. Ask them to sign in once and accept the Gmail permission.`);
    }
    console.error("sendClearToCloseEmail failed:", err);
    return fail("The email couldn't be sent. Try again in a moment.");
  }

  await db.insert(dealNotes).values({
    dealId,
    authorUserId: user.id,
    source: "system",
    body: `Clear to Close email sent to ${deal.borrowerName} from ${loanOfficer.name ?? loanOfficer.email} (approved by ${user.name ?? "staff"}).`,
  });
  revalidatePath(`/deals/${dealId}`);
  return { sent: true };
}

/** "No": records the answer so the deal stops asking. */
export async function declineClearToCloseEmail(dealId: string): Promise<{ declined: true } | ActionError> {
  const user = await requireUser();
  const [updated] = await db
    .update(deals)
    .set({ clearToCloseEmailStatus: "declined", clearToCloseEmailAt: new Date() })
    .where(and(eq(deals.id, dealId), isNull(deals.clearToCloseEmailStatus), eq(deals.stage, "clear_to_close")))
    .returning({ id: deals.id });
  if (!updated) return fail(CTC_NOT_WAITING);
  await db.insert(dealNotes).values({
    dealId,
    authorUserId: user.id,
    source: "system",
    body: `Chose not to send the Clear to Close email to the borrower (${user.name ?? "staff"}).`,
  });
  revalidatePath(`/deals/${dealId}`);
  return { declined: true };
}
