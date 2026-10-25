import { randomBytes } from "node:crypto";
import { and, eq, isNotNull, lte } from "drizzle-orm";
import { db } from "@/server/db/client";
import { closingSurveys, dealNotes, deals } from "@/server/db/schema";
import { sendGmailAs } from "@/server/gmail/send";
import { getCompanyName, getCompanyLogoHtml } from "@/server/settings";
import { getUserEmailSignatureHtml } from "@/server/users";
import { buildBorrowerEmail } from "@/server/borrower-templates";
import { appUrl, notifyAdmins } from "@/server/partner/email";
import { htmlButton } from "@/lib/email-html";
import {
  CLOSING_SURVEY_REQUESTS,
  CLOSING_SURVEY_TEMPLATE_KEYS,
  requestDueAt,
} from "@/lib/closing-survey";

type Survey = typeof closingSurveys.$inferSelect;

export function surveyUrl(token: string): string {
  return `${appUrl()}/review/${token}`;
}

async function loadDeal(dealId: string) {
  return db.query.deals.findFirst({ where: eq(deals.id, dealId), with: { assignedLoanOfficer: true } });
}

/**
 * Sends request number `survey.requestsSent` (0 = the Closed congratulations, 1-5 = reminders) from
 * the deal's assigned loan officer and moves the survey on. Returns whether an email went out.
 * Never throws: a failed send leaves the survey due so the next run tries again.
 */
async function sendNextRequest(survey: Survey): Promise<boolean> {
  const index = survey.requestsSent;
  const key = CLOSING_SURVEY_TEMPLATE_KEYS[index];
  if (!key) return false;

  try {
    const deal = await loadDeal(survey.dealId);
    const loanOfficer = deal?.assignedLoanOfficer;
    if (!deal?.borrowerEmail?.trim() || !loanOfficer?.email) return false;

    const url = surveyUrl(survey.token);
    const companyName = await getCompanyName();
    const { subject, body } = await buildBorrowerEmail(key, deal, {
      assignedLoanOfficerName: loanOfficer.name ?? "",
      companyName,
      senderName: loanOfficer.name ?? "",
      extra: { surveyUrl: url, surveyButton: htmlButton("Share your experience (about 1 minute)", url) },
    });
    const [logoHtml, signatureHtml] = await Promise.all([getCompanyLogoHtml(), getUserEmailSignatureHtml(loanOfficer.id)]);

    await sendGmailAs(loanOfficer.id, loanOfficer.email, {
      to: deal.borrowerEmail,
      subject,
      body: logoHtml + body + signatureHtml,
      html: true,
      dealId: deal.id,
      category: index === 0 ? "borrower_closed_congrats" : "borrower_survey_reminder",
    });

    const sent = index + 1;
    const next = requestDueAt(survey.startedAt, sent);
    await db
      .update(closingSurveys)
      .set({
        requestsSent: sent,
        lastRequestAt: new Date(),
        nextRequestAt: next,
        // After the sixth request we stop asking; the link keeps working if they come back to it.
        status: sent >= CLOSING_SURVEY_REQUESTS ? "no_response" : "pending",
      })
      .where(and(eq(closingSurveys.id, survey.id), eq(closingSurveys.requestsSent, index)));
    return true;
  } catch (err) {
    console.error("closing survey email failed:", err);
    return false;
  }
}

/**
 * Called when a deal reaches Closed. Creates the deal's survey (once, ever) and sends the
 * congratulations email right away. Never throws.
 */
export async function startClosingSurvey(dealId: string): Promise<void> {
  try {
    const deal = await loadDeal(dealId);
    if (!deal) return;
    const existing = await db.query.closingSurveys.findFirst({ where: eq(closingSurveys.dealId, dealId), columns: { id: true } });
    if (existing) return;

    const [survey] = await db
      .insert(closingSurveys)
      .values({ dealId, token: randomBytes(24).toString("base64url"), nextRequestAt: new Date() })
      .onConflictDoNothing({ target: closingSurveys.dealId })
      .returning();
    if (!survey) return;

    if (!deal.borrowerEmail?.trim() || !deal.assignedLoanOfficer?.email) {
      await db.update(closingSurveys).set({ status: "stopped", nextRequestAt: null }).where(eq(closingSurveys.id, survey.id));
      await db.insert(dealNotes).values({
        dealId,
        authorUserId: null,
        source: "system",
        body: !deal.borrowerEmail?.trim()
          ? "Closed congratulations email not sent: no borrower email on file."
          : "Closed congratulations email not sent: no loan officer is assigned to send it.",
      });
      return;
    }

    const sent = await sendNextRequest(survey);
    if (!sent) {
      // Leave it due so the daily run retries; tell staff why it didn't go out now.
      await notifyAdmins({
        type: "closing_survey",
        title: "Closed email didn't send",
        body: `${deal.borrowerName} (${deal.propertyAddress}): the congratulations email couldn't be sent from ${deal.assignedLoanOfficer.name ?? "the loan officer"}'s Gmail. It will retry tomorrow.`,
        href: "/directory/reviews",
      });
    }
  } catch (err) {
    console.error("startClosingSurvey failed:", err);
  }
}

/** The daily run: sends every reminder that has come due. */
export async function sendDueSurveyReminders(now: Date = new Date()): Promise<{ checked: number; sent: number }> {
  const due = await db.query.closingSurveys.findMany({
    where: and(eq(closingSurveys.status, "pending"), isNotNull(closingSurveys.nextRequestAt), lte(closingSurveys.nextRequestAt, now)),
  });
  let sent = 0;
  for (const survey of due) {
    if (await sendNextRequest(survey)) sent += 1;
  }
  return { checked: due.length, sent };
}

/** Staff action: send the next request now instead of waiting for its day. */
export async function sendSurveyRequestNow(surveyId: string): Promise<boolean> {
  const survey = await db.query.closingSurveys.findFirst({ where: eq(closingSurveys.id, surveyId) });
  if (!survey || survey.status === "completed" || survey.requestsSent >= CLOSING_SURVEY_REQUESTS) return false;
  return sendNextRequest(survey);
}
