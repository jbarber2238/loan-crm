import { requireAdmin } from "@/server/auth/guards";
import { getReviewRows } from "@/server/reviews-data";
import { ReviewsTable } from "@/components/reviews/reviews-table";
import { CLOSING_SURVEY_REQUESTS } from "@/lib/closing-survey";

export default async function ClientReviewsPage() {
  await requireAdmin();
  const rows = await getReviewRows();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Client Reviews</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          When a deal is marked Closed, the client gets a thank-you email and a one-minute survey, then up to{" "}
          {CLOSING_SURVEY_REQUESTS - 1} reminders. Open any row to read their private feedback and public review. A review
          only goes on your website when you press Publish, and only if the client gave permission.
        </p>
      </div>
      <ReviewsTable rows={rows} />
    </div>
  );
}
