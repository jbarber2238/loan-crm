import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals } from "@/server/db/schema";
import { constructStripeWebhookEvent } from "@/server/stripe";
import { advanceDealStage } from "@/server/actions/deals";
import { notifyBorrowerOfAcceptedTerms, notifyProcessorOfPaidDeal } from "@/server/deal-notifications";
import type Stripe from "stripe";

// No auth beyond the signature check below — Stripe calls this directly,
// there's no user session. Registered as a webhook endpoint in the Stripe
// Dashboard, listening for invoice.paid (and payment_failed, so a failed
// charge doesn't leave the deal silently stuck showing "open"); see
// src/server/stripe.ts for how the processing-fee invoice itself is created.
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    event = await constructStripeWebhookEvent(rawBody, signature);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 401 });
  }

  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const invoice = event.data.object as Stripe.Invoice;
    const deal = await db.query.deals.findFirst({ where: eq(deals.stripeInvoiceId, invoice.id) });
    if (deal) {
      await db
        .update(deals)
        .set({ stripeInvoiceStatus: event.type === "invoice.paid" ? "paid" : "payment_failed" })
        .where(eq(deals.id, deal.id));

      // No-op if the deal isn't currently at Negotiation (e.g. a retried
      // webhook delivery for the same already-processed invoice).
      if (event.type === "invoice.paid") {
        const advanced = await advanceDealStage(deal.id, "negotiation", "application", null);
        if (advanced) {
          await notifyBorrowerOfAcceptedTerms(deal.id).catch((err) => {
            console.error("Failed to send borrower accepted-terms notification:", err);
          });
          await notifyProcessorOfPaidDeal(deal.id).catch((err) => {
            console.error("Failed to send processor ready-to-process notification:", err);
          });
        }
      }
    }
  }

  return new Response("ok", { status: 200 });
}
