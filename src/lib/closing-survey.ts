// The post-closing survey: what we ask, when we ask, and how a score is read. Kept free of
// database code so it can be tested and shared by the email sender, the public page and the
// admin screen.

/** Days after closing that each of the six requests goes out: the thank-you email, then five reminders. */
export const CLOSING_SURVEY_DAYS = [0, 3, 7, 14, 21, 30] as const;
export const CLOSING_SURVEY_REQUESTS = CLOSING_SURVEY_DAYS.length;

/** Editable email templates, in the order they go out. */
export const CLOSING_SURVEY_TEMPLATE_KEYS = [
  "borrower_closed_congrats",
  "borrower_survey_reminder_1",
  "borrower_survey_reminder_2",
  "borrower_survey_reminder_3",
  "borrower_survey_reminder_4",
  "borrower_survey_reminder_5",
] as const;

export const SCORE_QUESTIONS = [
  { key: "scoreCommunication", label: "Communication", prompt: "How responsive and clear were we throughout your loan?" },
  { key: "scoreProcess", label: "Clarity of the process", prompt: "How well did you always know what we needed from you and what came next?" },
  { key: "scoreSpeed", label: "Speed to close", prompt: "How happy were you with how fast we got you to the closing table?" },
  { key: "scoreTerms", label: "Terms & lender match", prompt: "How happy are you with the loan terms and the lender we found for you?" },
] as const;

export type ScoreKey = (typeof SCORE_QUESTIONS)[number]["key"];

export type SurveyScores = Record<ScoreKey, number> & { scoreRecommend: number };

export const PRIVATE_FEEDBACK_PROMPT = "Is there anything we could do better? This stays private, and only our team sees it.";
export const PUBLIC_REVIEW_PROMPT = "In a sentence or two, what was it like working with us?";
export const RECOMMEND_PROMPT = "How likely are you to recommend Manna Lending to a friend or fellow investor?";

/** When request number `index` (0 = the first email) is due, given when the deal closed. */
export function requestDueAt(startedAt: Date, index: number): Date | null {
  const days = CLOSING_SURVEY_DAYS[index];
  return days === undefined ? null : new Date(startedAt.getTime() + days * 24 * 60 * 60 * 1000);
}

/** A whole number from 0 to 10, or null for anything else. */
export function parseScore(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 10 ? n : null;
}

/** The standard NPS buckets: 9-10 promoter, 7-8 passive, 0-6 detractor. */
export function npsBucket(score: number): "promoter" | "passive" | "detractor" {
  return score >= 9 ? "promoter" : score >= 7 ? "passive" : "detractor";
}

/** Net Promoter Score for a set of recommend scores, -100 to 100, or null with no answers. */
export function netPromoterScore(scores: number[]): number | null {
  if (scores.length === 0) return null;
  const promoters = scores.filter((s) => npsBucket(s) === "promoter").length;
  const detractors = scores.filter((s) => npsBucket(s) === "detractor").length;
  return Math.round(((promoters - detractors) / scores.length) * 100);
}

/** Someone who'd recommend us (8 or higher) is offered the referral program. */
export function offerReferralProgram(recommendScore: number | null): boolean {
  return recommendScore !== null && recommendScore >= 8;
}

/** Whether staff should be alerted right away that someone is unhappy. */
export function isLowScore(scores: SurveyScores): boolean {
  const all = [scores.scoreCommunication, scores.scoreProcess, scores.scoreSpeed, scores.scoreTerms, scores.scoreRecommend];
  return scores.scoreRecommend <= 6 || Math.min(...all) <= 5;
}

/** "Andrew Smith" -> "Andrew S."; what's shown beside a public review unless the client types their own. */
export function defaultReviewerName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A Manna client";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/** A review can go on the website only with permission and some actual words. */
export function canPublishReview(survey: { reviewPermission: boolean; publicReview: string | null }): boolean {
  return survey.reviewPermission && Boolean(survey.publicReview?.trim());
}

export function average(values: (number | null)[]): number | null {
  const real = values.filter((v): v is number => v !== null);
  return real.length ? Math.round((real.reduce((a, b) => a + b, 0) / real.length) * 10) / 10 : null;
}
