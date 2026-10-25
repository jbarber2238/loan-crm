import { desc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { closingSurveys, deals } from "@/server/db/schema";
import { LOAN_CATEGORIES, labelFor } from "@/lib/labels";

const SAND = "#CBB8A0";
const TEAL = "#143D4A";
const MOSS = "#68735F";
const BASALT = "#1E1E1E";
const OFF_WHITE = "#FAF7F2";

type Review = { id: string; text: string; name: string; program: string | null };

async function publishedReviews(): Promise<Review[]> {
  try {
    const rows = await db
      .select({
        id: closingSurveys.id,
        text: closingSurveys.publicReview,
        name: closingSurveys.reviewerName,
        category: deals.loanCategory,
      })
      .from(closingSurveys)
      .innerJoin(deals, eq(deals.id, closingSurveys.dealId))
      .where(eq(closingSurveys.publishedToWebsite, true))
      .orderBy(desc(closingSurveys.publishedAt));
    return rows
      .filter((r) => r.text?.trim())
      .map((r) => ({
        id: r.id,
        text: r.text!.trim(),
        name: r.name?.trim() || "A Manna client",
        program: r.category ? labelFor(LOAN_CATEGORIES, r.category) : null,
      }));
  } catch (err) {
    // The home page must never fail to render because of this section.
    console.error("Couldn't load published reviews:", err);
    return [];
  }
}

function ReviewCard({ review }: { review: Review }) {
  return (
    <figure className="flex h-full w-[min(86vw,22rem)] shrink-0 flex-col justify-between rounded-sm bg-white p-6 shadow-sm md:w-[22rem]">
      <blockquote className="text-sm leading-relaxed" style={{ color: BASALT }}>
        <span aria-hidden="true" className="mr-1 text-3xl leading-none" style={{ color: SAND }}>
          &ldquo;
        </span>
        {review.text}
      </blockquote>
      <figcaption className="mt-5 text-xs" style={{ color: MOSS }}>
        <span className="font-medium" style={{ color: TEAL }}>
          {review.name}
        </span>
        {review.program && <span> · {review.program} client</span>}
      </figcaption>
    </figure>
  );
}

/**
 * "What our clients say about us." Shows only the reviews staff have published from Settings →
 * Client Reviews, and nothing at all until there's at least one. Up to three sit still in a row;
 * with more, they scroll slowly across (and stop on hover, or when the visitor prefers less motion).
 */
export async function ReviewsSection() {
  const reviews = await publishedReviews();
  if (reviews.length === 0) return null;
  const scrolling = reviews.length > 3;

  return (
    <section id="reviews" style={{ backgroundColor: OFF_WHITE }}>
      <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
        <p className="text-xs font-medium tracking-[0.2em]" style={{ color: MOSS }}>
          CLIENT REVIEWS
        </p>
        <h2 className="mt-3 text-2xl font-normal md:text-3xl" style={{ color: TEAL }}>
          What our clients say about us
        </h2>
      </div>

      {scrolling ? (
        <div className="manna-reviews-viewport overflow-hidden pb-20 md:pb-24">
          <style>{`
            @keyframes manna-reviews-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
            .manna-reviews-track { display: flex; gap: 1.25rem; width: max-content; animation: manna-reviews-scroll ${Math.max(30, reviews.length * 9)}s linear infinite; }
            .manna-reviews-viewport:hover .manna-reviews-track { animation-play-state: paused; }
            @media (prefers-reduced-motion: reduce) {
              .manna-reviews-viewport { overflow-x: auto; }
              .manna-reviews-track { animation: none; }
            }
          `}</style>
          <div className="manna-reviews-track px-6">
            {[...reviews, ...reviews].map((r, i) => (
              <div key={`${r.id}-${i}`} aria-hidden={i >= reviews.length} className="flex">
                <ReviewCard review={r} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mx-auto flex max-w-6xl flex-wrap justify-center gap-5 px-6 pb-20 md:pb-24">
          {reviews.map((r) => (
            <div key={r.id} className="flex">
              <ReviewCard review={r} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
