"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { closingSurveys, dealNotes } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { fail } from "@/lib/action-result";
import { notifyAdmins } from "@/server/partner/email";
import { sendSurveyRequestNow } from "@/server/closing-survey";
import {
  canPublishReview,
  defaultReviewerName,
  isLowScore,
  parseScore,
  type SurveyScores,
} from "@/lib/closing-survey";

const MAX_TEXT = 4000;

export interface SurveyAnswers {
  scoreCommunication: number | null;
  scoreProcess: number | null;
  scoreSpeed: number | null;
  scoreTerms: number | null;
  scoreRecommend: number | null;
  privateFeedback: string;
  publicReview: string;
  reviewerName: string;
  reviewPermission: boolean;
}

function clean(value: unknown, max = MAX_TEXT): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/**
 * The client's own submit, from the private link in their email (no sign-in: the long random
 * token is the key). Saves once; a second submit just says it was already received.
 */
export async function submitClosingSurvey(token: string, answers: SurveyAnswers) {
  const survey = await db.query.closingSurveys.findFirst({
    where: eq(closingSurveys.token, token),
    with: { deal: { columns: { id: true, borrowerName: true, propertyAddress: true } } },
  });
  if (!survey) return fail("This link isn't valid. Reply to our email and we'll send a new one.");
  if (survey.status === "completed") return fail("We already have your answers. Thank you!");

  const scores = {
    scoreCommunication: parseScore(answers.scoreCommunication),
    scoreProcess: parseScore(answers.scoreProcess),
    scoreSpeed: parseScore(answers.scoreSpeed),
    scoreTerms: parseScore(answers.scoreTerms),
    scoreRecommend: parseScore(answers.scoreRecommend),
  };
  if (Object.values(scores).some((s) => s === null)) return fail("Please choose a score from 0 to 10 for every question.");

  const publicReview = clean(answers.publicReview);
  const reviewerName = clean(answers.reviewerName, 80) || defaultReviewerName(survey.deal.borrowerName);
  const reviewPermission = Boolean(answers.reviewPermission) && publicReview.length > 0;

  const [saved] = await db
    .update(closingSurveys)
    .set({
      ...(scores as SurveyScores),
      privateFeedback: clean(answers.privateFeedback) || null,
      publicReview: publicReview || null,
      reviewerName,
      reviewPermission,
      status: "completed",
      completedAt: new Date(),
      nextRequestAt: null,
    })
    .where(and(eq(closingSurveys.id, survey.id), ne(closingSurveys.status, "completed")))
    .returning({ id: closingSurveys.id });
  if (!saved) return fail("We already have your answers. Thank you!");

  const low = isLowScore(scores as SurveyScores);
  const first = survey.deal.borrowerName.trim().split(/\s+/)[0];
  await notifyAdmins({
    type: "closing_survey",
    title: low ? `${first} left low survey scores` : `${first} completed the closing survey`,
    body: `${survey.deal.propertyAddress}: would recommend us ${scores.scoreRecommend}/10.${
      publicReview && reviewPermission ? " They wrote a review you can publish." : ""
    }${answers.privateFeedback?.trim() ? " They also left private feedback." : ""}`,
    href: "/settings/reviews",
  });
  await db.insert(dealNotes).values({
    dealId: survey.deal.id,
    authorUserId: null,
    source: "system",
    body: `Closing survey completed: would recommend ${scores.scoreRecommend}/10.`,
  });
  revalidatePath("/settings/reviews");
  return { saved: true as const };
}

// ---- Staff actions (Settings → Client Reviews) -----------------------------------------------

/** Puts a review on the website, or takes it down. Only a review the client gave permission for can go up. */
export async function setReviewPublished(surveyId: string, published: boolean) {
  await requireAdmin();
  const survey = await db.query.closingSurveys.findFirst({ where: eq(closingSurveys.id, surveyId) });
  if (!survey) return fail("Review not found.");
  if (published && !canPublishReview(survey)) {
    return fail("This client didn't give permission to share their review, so it can't go on the website.");
  }
  await db
    .update(closingSurveys)
    .set({ publishedToWebsite: published, publishedAt: published ? new Date() : null })
    .where(eq(closingSurveys.id, surveyId));
  revalidatePath("/settings/reviews");
  revalidatePath("/");
  return { published };
}

/** Sends the next request now (the congratulations email or the next reminder) instead of waiting. */
export async function sendSurveyReminderNow(surveyId: string) {
  await requireAdmin();
  const sent = await sendSurveyRequestNow(surveyId);
  revalidatePath("/settings/reviews");
  return sent ? { sent: true as const } : fail("That couldn't be sent. Check the deal has a borrower email and a loan officer whose Gmail is connected.");
}

/** Stops the reminders for one client (they asked, or it's no longer appropriate), or turns them back on. */
export async function setSurveyReminders(surveyId: string, on: boolean) {
  await requireAdmin();
  const survey = await db.query.closingSurveys.findFirst({ where: eq(closingSurveys.id, surveyId) });
  if (!survey) return fail("Not found.");
  if (survey.status === "completed") return fail("They've already answered.");
  await db
    .update(closingSurveys)
    .set(on ? { status: "pending", nextRequestAt: new Date() } : { status: "stopped", nextRequestAt: null })
    .where(eq(closingSurveys.id, surveyId));
  revalidatePath("/settings/reviews");
  return { on };
}
