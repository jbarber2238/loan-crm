import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals } from "@/server/db/schema";
import { createProcessingFeeInvoice, voidStripeInvoice } from "@/server/stripe";
import { STANDARD_PROCESSING_FEE } from "@/lib/term-sheet-calculations";
import { getCompanyName, getCompanyLogoHtml } from "@/server/settings";
import { getUserEmailSignatureHtml } from "@/server/users";
import { sendGmailAs } from "@/server/gmail/send";
import { htmlButton } from "@/lib/email-html";
import { buildBorrowerEmail } from "@/server/borrower-templates";

type DealForInvoiceEmail = typeof deals.$inferSelect & {
  assignedLoanOfficer: { id: string; name: string | null; email: string | null } | null;
};

/**
 * Sends the app's own "here's your processing fee invoice" email — used
 * instead of Stripe's built-in invoice email, whose fixed subject template
 * ("New invoice from X #6CZ8AQ8I-0001") isn't customizable via the API (see
 * createProcessingFeeInvoice in src/server/stripe.ts). Sent as the deal's
 * assigned loan officer via their own connected Gmail, matching every other
 * borrower-facing email in the app. Subject/body come from the
 * "processing_fee_invoice" borrower_lifecycle template (Email Templates
 * page) so Justin can edit the wording himself, same as every other
 * borrower email — see the seeded default in scratch-migrate-* history.
 *
 * Throws on failure (template missing/inactive, LO hasn't connected Gmail,
 * Google API error) rather than swallowing it — resendProcessingFeeInvoice
 * (an explicit user action) needs that to surface as a real error, while
 * syncProcessingFeeInvoice (the automatic path) already wraps its whole
 * invoice flow in its own try/catch, so a failure here doesn't block term
 * sheet acceptance either.
 *
 * The template's body is authored as raw HTML (not plain text run through
 * plainTextToHtml, like the book-a-call/term-sheet templates) — same
 * convention as borrower_client_needs_update — so {{processingFeeInvoiceButton}}
 * can render as a real styled button instead of a bare link.
 */
export async function sendProcessingFeeInvoiceEmail(
  deal: DealForInvoiceEmail,
  amount: number,
  hostedInvoiceUrl: string | null
): Promise<void> {
  const lo = deal.assignedLoanOfficer;
  if (!lo?.email) throw new Error("This deal has no assigned loan officer to send the invoice email from");
  if (!deal.borrowerEmail) throw new Error("This deal has no borrower email on file");
  if (!hostedInvoiceUrl) throw new Error("No payment link is on file for this invoice");

  const companyName = await getCompanyName();
  const [{ subject, body }, logoHtml, signatureHtml] = await Promise.all([
    buildBorrowerEmail("processing_fee_invoice", deal, {
      assignedLoanOfficerName: lo.name ?? "",
      companyName,
      senderName: lo.name ?? "",
      extra: {
        processingFeeInvoiceAmount: `$${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`,
        processingFeeInvoiceUrl: hostedInvoiceUrl,
        processingFeeInvoiceButton: htmlButton("Pay this invoice", hostedInvoiceUrl),
      },
    }),
    getCompanyLogoHtml(),
    getUserEmailSignatureHtml(lo.id),
  ]);

  await sendGmailAs(lo.id, lo.email, {
    to: deal.borrowerEmail,
    subject,
    body: logoHtml + body + signatureHtml,
    html: true,
  });
}

/**
 * Creates or refreshes the deal's processing-fee invoice so it matches the
 * deal's current effective fee (STANDARD_PROCESSING_FEE, or
 * processingFeeOverride if negotiated). Called after a term sheet is
 * accepted (src/server/actions/term-sheets.ts) and whenever the accepted
 * terms are edited (updateAcceptedTerms in src/server/actions/deals.ts) —
 * either of those is where the fee could change.
 *
 * Once an invoice has been marked paid, this never touches the deal again —
 * a paid fee is done regardless of what else changes afterward. If there's
 * already an unpaid invoice for the current amount, it's left alone too
 * (see resendProcessingFeeInvoice in src/server/actions/term-sheets.ts for
 * "borrower lost the email" cases) — a fresh invoice is only created when
 * there isn't one yet, or the amount has genuinely changed while nothing's
 * been paid.
 */
export async function syncProcessingFeeInvoice(dealId: string): Promise<void> {
  try {
    // Serialized per deal: two overlapping runs (a duplicate PandaDoc
    // webhook delivery, a double-click) used to both see "no invoice yet"
    // and each create one — Stripe ended up with two, only one of which the
    // deal tracked, so paying the untracked one never advanced the deal.
    // The second run now waits here, re-reads the deal, sees the first
    // run's invoice, and returns without creating another.
    const created = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${dealId}))`);

      const deal = await tx.query.deals.findFirst({
        where: eq(deals.id, dealId),
        with: { assignedLoanOfficer: { columns: { id: true, name: true, email: true } } },
      });
      if (!deal || !deal.borrowerEmail) return null;
      if (deal.stripeInvoiceStatus === "paid") return null;

      const amount = deal.processingFeeOverride ? Number(deal.processingFeeOverride) : STANDARD_PROCESSING_FEE;

      if (deal.stripeInvoiceId && deal.stripeInvoiceAmount !== null && Number(deal.stripeInvoiceAmount) === amount) {
        return null;
      }

      if (deal.stripeInvoiceId) {
        await voidStripeInvoice(deal.stripeInvoiceId).catch((err) => {
          console.error(
            `Failed to void stale processing-fee invoice ${deal.stripeInvoiceId} for deal ${dealId} (continuing to create the new one anyway):`,
            err
          );
        });
      }

      const { customerId, invoiceId, hostedInvoiceUrl } = await createProcessingFeeInvoice({
        dealId,
        existingCustomerId: deal.stripeCustomerId,
        borrowerName: deal.borrowerName,
        borrowerEntityName: deal.borrowerEntityName,
        borrowerEmail: deal.borrowerEmail,
        propertyAddress: deal.propertyAddress,
        amount,
      });

      await tx
        .update(deals)
        .set({
          stripeCustomerId: customerId,
          stripeInvoiceId: invoiceId,
          stripeInvoiceStatus: "open",
          stripeInvoiceAmount: String(amount),
          stripeInvoiceUrl: hostedInvoiceUrl,
        })
        .where(eq(deals.id, dealId));

      return { deal, amount, hostedInvoiceUrl };
    });

    if (created) await sendProcessingFeeInvoiceEmail(created.deal, created.amount, created.hostedInvoiceUrl);
  } catch (err) {
    console.error(`Failed to create processing-fee invoice for deal ${dealId}:`, err);
  }
}
