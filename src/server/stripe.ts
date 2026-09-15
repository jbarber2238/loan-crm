import crypto from "crypto";
import Stripe from "stripe";
import { getStripeSecretKey, getStripeWebhookSecret } from "@/server/settings";

// Thin wrapper around Stripe's API — used to auto-invoice the $999
// processing fee right after a borrower signs their accepted term sheet
// (see performTermSheetAcceptance in src/server/actions/term-sheets.ts).
// The secret key and webhook signing secret live in Settings →
// Integrations (company_settings table), not environment variables — same
// pattern as PandaDoc (src/server/pandadoc.ts), and deliberately separate
// from any Stripe access used elsewhere (e.g. an MCP connection): the
// deployed app needs its own credentials to run this in production.

export class StripeNotConfiguredError extends Error {
  constructor() {
    super("Stripe isn't connected yet — add your secret key in Settings → Integrations.");
    this.name = "StripeNotConfiguredError";
  }
}

async function stripeClient(): Promise<Stripe> {
  const key = await getStripeSecretKey();
  if (!key) throw new StripeNotConfiguredError();
  return new Stripe(key);
}

interface ProcessingFeeInvoiceInput {
  dealId: string;
  existingCustomerId: string | null;
  borrowerName: string;
  borrowerEntityName: string | null;
  borrowerEmail: string | null;
  propertyAddress: string;
  amount: number;
}

interface ProcessingFeeInvoiceResult {
  customerId: string;
  invoiceId: string;
  hostedInvoiceUrl: string | null;
}

/**
 * Finds or creates the Stripe Customer for this deal, then creates and
 * finalizes a one-time invoice for the processing fee — due upon receipt
 * (days_until_due: 0). The borrower pays via Stripe's own hosted invoice
 * page (no saved payment method needed), whose URL is available as soon as
 * the invoice is finalized.
 *
 * Deliberately does NOT call Stripe's own "send invoice" email — Stripe's
 * fixed template puts the auto-generated invoice number in the subject
 * (e.g. "New invoice from X #6CZ8AQ8I-0001"), which isn't customizable via
 * the API. Justin wants the property address there instead, so the app
 * sends its own branded email (sendProcessingFeeInvoiceEmail in
 * src/server/billing.ts) with the hosted_invoice_url this returns. Justin
 * also needs to turn off "Email customers about finalized invoices" in
 * Stripe's Dashboard (Settings → Billing → Emails) — finalizing a
 * send_invoice invoice triggers Stripe's own email based on that account
 * setting, independent of whether this code calls sendInvoice.
 *
 * Borrower name, entity name, and property address are surfaced as invoice
 * custom fields (in addition to the customer name) since a Stripe customer
 * only holds a single name string but Justin wants all three visible on the
 * invoice itself.
 *
 * Called more than once per deal isn't a mistake — a renegotiated fee (see
 * syncProcessingFeeInvoice in src/server/billing.ts) voids the stale invoice
 * and creates a fresh one at the new amount — so the idempotency key here is
 * random per call, only to protect a single attempt from a network retry,
 * not to dedupe across separate calls the way a fixed per-deal key would.
 */
export async function createProcessingFeeInvoice({
  dealId,
  existingCustomerId,
  borrowerName,
  borrowerEntityName,
  borrowerEmail,
  propertyAddress,
  amount,
}: ProcessingFeeInvoiceInput): Promise<ProcessingFeeInvoiceResult> {
  const stripe = await stripeClient();
  const attemptKey = crypto.randomUUID();

  let customerId = existingCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: borrowerEntityName || borrowerName,
      email: borrowerEmail || undefined,
      metadata: { dealId },
    });
    customerId = customer.id;
  }

  const invoice = await stripe.invoices.create(
    {
      customer: customerId,
      collection_method: "send_invoice",
      days_until_due: 0,
      auto_advance: true,
      pending_invoice_items_behavior: "exclude",
      custom_fields: [
        { name: "Borrower", value: borrowerName.slice(0, 30) },
        ...(borrowerEntityName ? [{ name: "Entity", value: borrowerEntityName.slice(0, 30) }] : []),
        { name: "Property", value: propertyAddress.slice(0, 30) },
      ],
      metadata: { dealId },
    },
    { idempotencyKey: `processing-fee-invoice-${attemptKey}` }
  );

  await stripe.invoiceItems.create(
    {
      customer: customerId,
      invoice: invoice.id,
      amount: Math.round(amount * 100),
      currency: "usd",
      description: `Processing Fee — ${propertyAddress}`,
    },
    { idempotencyKey: `processing-fee-item-${attemptKey}` }
  );

  const finalized = await stripe.invoices.finalizeInvoice(invoice.id!);

  return {
    customerId,
    invoiceId: finalized.id!,
    hostedInvoiceUrl: finalized.hosted_invoice_url ?? null,
  };
}

/**
 * Voids a not-yet-paid invoice — used when the processing fee changes before
 * the original invoice was paid, so the stale amount stops being collectible
 * before a fresh invoice is created at the new amount. A no-op error from
 * Stripe if the invoice was somehow already paid/voided is left to the
 * caller to decide whether it's worth surfacing.
 */
export async function voidStripeInvoice(invoiceId: string): Promise<void> {
  const stripe = await stripeClient();
  await stripe.invoices.voidInvoice(invoiceId);
}

/**
 * Verifies an incoming webhook really came from Stripe using its own SDK
 * helper (HMAC-SHA256 over the raw body + timestamp, timing-safe compare)
 * against the webhook signing secret from the webhook endpoint's settings.
 */
export async function constructStripeWebhookEvent(
  rawBody: string,
  signature: string | null
): Promise<Stripe.Event> {
  const secret = await getStripeWebhookSecret();
  if (!secret || !signature) throw new Error("Stripe webhook isn't configured or signature is missing");
  const stripe = await stripeClient();
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}
