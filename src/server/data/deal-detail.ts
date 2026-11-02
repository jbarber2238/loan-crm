import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals } from "@/server/db/schema";

// Shared by the /deals/[id] layout (header) and each of its tab pages —
// wrapped in React's cache() so navigating directly to a tab route (where
// both the layout and the page run in the same request) only hits the DB once.
export const getDealDetail = cache(async (id: string) => {
  return db.query.deals.findFirst({
    where: eq(deals.id, id),
    with: {
      assignedLoanOfficer: true,
      assignedProcessor: true,
      assignedAssistant: true,
      referredByAffiliate: true,
      lender: { with: { reps: true } },
      product: true,
      notes: { with: { author: true } },
      clientNeeds: true,
      // Never the file bytes (signed PDFs, reply attachments): this loads on every deal page and tab, and they
      // are base64 text. Their own routes fetch a single file when someone opens it.
      termSheets: { columns: { signedDocumentData: false }, with: { lender: true, product: true } },
      pricingRequests: {
        with: { lender: true, lenderRep: true, replyAttachments: { columns: { data: false } } },
      },
      followers: true,
      deletedByUser: true,
      archivedByUser: true,
      keyDateEvents: {
        with: { createdBy: true },
        // Same-day entries (the common case — someone clicks through several
        // stages in one sitting) tie on eventDate; break ties by creation
        // order so "most recent" is deterministic instead of whatever order
        // Postgres happens to return.
        orderBy: (e, { desc }) => [desc(e.eventDate), desc(e.createdAt)],
      },
    },
  });
});

export type DealDetail = NonNullable<Awaited<ReturnType<typeof getDealDetail>>>;
