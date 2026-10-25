import { desc } from "drizzle-orm";
import { db } from "@/server/db/client";
import { closingSurveys } from "@/server/db/schema";
import { CLOSING_SURVEY_REQUESTS } from "@/lib/closing-survey";
import type { ReviewExportRow } from "@/lib/review-export";

/** One survey as the Client Reviews table needs it: plain values only, safe to hand to the browser. */
export interface ReviewRow {
  id: string;
  dealId: string;
  client: string;
  property: string;
  loanNumber: number | null;
  status: "answered" | "waiting" | "no_response" | "stopped";
  requestsSent: number;
  /** When the survey went out (the deal closed). */
  sentAt: string;
  answeredAt: string | null;
  communication: number | null;
  process: number | null;
  speed: number | null;
  terms: number | null;
  recommend: number | null;
  privateFeedback: string | null;
  publicReview: string | null;
  reviewerName: string | null;
  permission: boolean;
  published: boolean;
}

export async function getReviewRows(): Promise<ReviewRow[]> {
  const surveys = await db.query.closingSurveys.findMany({
    orderBy: desc(closingSurveys.startedAt),
    with: { deal: { columns: { id: true, borrowerName: true, propertyAddress: true, loanNumber: true } } },
  });
  return surveys.map((s) => ({
    id: s.id,
    dealId: s.deal.id,
    client: s.deal.borrowerName,
    property: s.deal.propertyAddress,
    loanNumber: s.deal.loanNumber ?? null,
    status:
      s.status === "completed" ? "answered" : s.status === "pending" ? "waiting" : s.status === "no_response" ? "no_response" : "stopped",
    requestsSent: s.requestsSent,
    sentAt: s.startedAt.toISOString(),
    answeredAt: s.completedAt?.toISOString() ?? null,
    communication: s.scoreCommunication,
    process: s.scoreProcess,
    speed: s.scoreSpeed,
    terms: s.scoreTerms,
    recommend: s.scoreRecommend,
    privateFeedback: s.privateFeedback,
    publicReview: s.publicReview,
    reviewerName: s.reviewerName,
    permission: s.reviewPermission,
    published: s.publishedToWebsite,
  }));
}

export const REVIEW_STATUS_LABEL: Record<ReviewRow["status"], string> = {
  answered: "Answered",
  waiting: "Waiting",
  no_response: `No response after ${CLOSING_SURVEY_REQUESTS} requests`,
  stopped: "Reminders stopped",
};

export function toExportRow(r: ReviewRow): ReviewExportRow {
  return {
    client: r.client,
    property: r.property,
    loanNumber: r.loanNumber,
    status: REVIEW_STATUS_LABEL[r.status],
    answeredOn: r.answeredAt ? new Date(r.answeredAt) : null,
    communication: r.communication,
    process: r.process,
    speed: r.speed,
    terms: r.terms,
    recommend: r.recommend,
    privateFeedback: r.privateFeedback,
    publicReview: r.publicReview,
    permission: r.permission,
    onWebsite: r.published,
  };
}
