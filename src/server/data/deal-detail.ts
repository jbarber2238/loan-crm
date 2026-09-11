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
      lender: true,
      product: true,
      notes: { with: { author: true } },
      clientNeeds: true,
      termSheets: { with: { lender: true, product: true } },
      pricingRequests: { with: { lender: true, lenderRep: true, replyAttachments: true } },
      followers: true,
    },
  });
});

export type DealDetail = NonNullable<Awaited<ReturnType<typeof getDealDetail>>>;
