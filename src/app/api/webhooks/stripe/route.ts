import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals } from "@/server/db/schema";
import { constructStripeWebhookEvent } from "@/server/stripe";
import { handleProcessingFeePaid } from "@/server/processing-fee-paid";
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
    let deal = await db.query.deals.findFirst({ where: eq(deals.stripeInvoiceId, invoice.id) });
    // A paid invoice the deal isn't tracking (e.g. a duplicate created by
    // overlapping term-sheet acceptances) still belongs to its deal via the
    // dealId stamped on it at creation — pay attention to that too.
    if (!deal && event.type === "invoice.paid" && invoice.metadata?.dealId) {
      deal = await db.query.deals.findFirst({ where: eq(deals.id, invoice.metadata.dealId) });
    }
    if (deal) {
      if (event.type === "invoice.paid") {
        await handleProcessingFeePaid(deal.id, null);
      } else {
        await db.update(deals).set({ stripeInvoiceStatus: "payment_failed" }).where(eq(deals.id, deal.id));
      }
    }
  }

  return new Response("ok", { status: 200 });
}
