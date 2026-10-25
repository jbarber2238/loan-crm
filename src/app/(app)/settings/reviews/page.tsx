import Link from "next/link";
import { desc } from "drizzle-orm";
import { requireAdmin } from "@/server/auth/guards";
import { db } from "@/server/db/client";
import { closingSurveys } from "@/server/db/schema";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublishReviewButton, SurveyRowActions } from "@/components/settings/review-controls";
import {
  CLOSING_SURVEY_REQUESTS,
  SCORE_QUESTIONS,
  average,
  canPublishReview,
  netPromoterScore,
  npsBucket,
} from "@/lib/closing-survey";

const date = (d: Date | null) => (d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

function ScoreChip({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  const tone = value >= 9 ? "bg-green-600/15 text-green-800 dark:text-green-300" : value >= 7 ? "bg-amber-500/15 text-amber-800 dark:text-amber-300" : "bg-destructive/15 text-destructive";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${tone}`}>
      {label}
      <strong className="tabular-nums">{value}</strong>
    </span>
  );
}

export default async function ClientReviewsPage() {
  await requireAdmin();
  const surveys = await db.query.closingSurveys.findMany({
    orderBy: desc(closingSurveys.startedAt),
    with: { deal: { columns: { id: true, borrowerName: true, propertyAddress: true, loanNumber: true } } },
  });

  const completed = surveys.filter((s) => s.status === "completed");
  const nps = netPromoterScore(completed.map((s) => s.scoreRecommend).filter((v): v is number => v !== null));
  const published = surveys.filter((s) => s.publishedToWebsite);

  const stats = [
    { label: "Net Promoter Score", value: nps === null ? "–" : String(nps), note: "–100 to 100" },
    { label: "Answered", value: `${completed.length} of ${surveys.length}`, note: surveys.length ? `${Math.round((completed.length / surveys.length) * 100)}% response` : "" },
    ...SCORE_QUESTIONS.map((q) => ({ label: q.label, value: String(average(completed.map((s) => s[q.key])) ?? "–"), note: "average, 0–10" })),
    { label: "On the website", value: String(published.length), note: "published reviews" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Client Reviews</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          When a deal is marked Closed, the client gets a thank-you email and a one-minute survey, then up to five reminders
          (days 3, 7, 14, 21 and 30). Reviews only appear on your website when you press Publish here, and only if the client
          gave permission. You can edit every email under{" "}
          <Link href="/settings/email-templates" className="underline">
            Email Templates
          </Link>
          .
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => (
          <Card key={s.label} size="sm">
            <CardContent className="space-y-0.5 py-3">
              <p className="text-[11px] font-medium text-muted-foreground uppercase">{s.label}</p>
              <p className="text-xl font-semibold tabular-nums">{s.value}</p>
              <p className="text-[11px] text-muted-foreground">{s.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {surveys.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nothing yet. The first survey goes out the next time a deal is marked Closed.
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {surveys.map((s) => {
          const isDone = s.status === "completed";
          return (
            <Card key={s.id}>
              <CardHeader className="gap-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="text-base">
                    <Link href={`/deals/${s.deal.id}`} className="hover:underline">
                      {s.deal.borrowerName}
                    </Link>
                    <span className="ml-2 text-sm font-normal text-muted-foreground">{s.deal.propertyAddress}</span>
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2">
                    {s.publishedToWebsite && <Badge variant="success">On website</Badge>}
                    {isDone ? (
                      <Badge variant="secondary">Answered {date(s.completedAt)}</Badge>
                    ) : s.status === "pending" ? (
                      <Badge variant="warning">
                        Waiting · {s.requestsSent} of {CLOSING_SURVEY_REQUESTS} sent
                      </Badge>
                    ) : s.status === "no_response" ? (
                      <Badge variant="secondary">No response after {CLOSING_SURVEY_REQUESTS} requests</Badge>
                    ) : (
                      <Badge variant="secondary">Reminders stopped</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {isDone && (
                  <div className="flex flex-wrap gap-2">
                    {SCORE_QUESTIONS.map((q) => (
                      <ScoreChip key={q.key} label={q.label} value={s[q.key]} />
                    ))}
                    {s.scoreRecommend !== null && (
                      <ScoreChip label={`Would recommend (${npsBucket(s.scoreRecommend)})`} value={s.scoreRecommend} />
                    )}
                  </div>
                )}

                {s.privateFeedback && (
                  <div className="rounded-lg border bg-muted/40 p-3">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase">Private feedback (never public)</p>
                    <p className="mt-1 text-sm whitespace-pre-wrap">{s.privateFeedback}</p>
                  </div>
                )}

                {s.publicReview && (
                  <div className="space-y-3 rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase">Public review</p>
                      <Badge variant={s.reviewPermission ? "success" : "destructive"}>
                        {s.reviewPermission ? "Permission to use it" : "No permission to use it"}
                      </Badge>
                    </div>
                    <blockquote className="text-sm whitespace-pre-wrap">&ldquo;{s.publicReview}&rdquo;</blockquote>
                    <p className="text-xs text-muted-foreground">Shown as {s.reviewerName}</p>
                    <PublishReviewButton surveyId={s.id} published={s.publishedToWebsite} allowed={canPublishReview(s)} />
                  </div>
                )}

                <SurveyRowActions surveyId={s.id} status={s.status} requestsSent={s.requestsSent} total={CLOSING_SURVEY_REQUESTS} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
