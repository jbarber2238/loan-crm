import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { emailTemplates } from "@/server/db/schema";
import { PROPERTY_TYPES, labelFor } from "@/lib/labels";
import { buildAllDealTokens } from "@/server/deal-tokens";
import type { deals } from "@/server/db/schema";

type Deal = typeof deals.$inferSelect;

const REFINANCE_CATEGORIES = new Set(["dscr_cash_out_refinance", "dscr_rate_term_refinance", "bridge_refinance"]);
const PURCHASE_CATEGORIES = new Set(["dscr_purchase", "bridge_purchase"]);

function money(value: string | null): string {
  return value ? `$${Number(value).toLocaleString()}` : "Not provided";
}

function ltv(loanAmount: string, basis: string | null): string {
  if (!basis || Number(basis) === 0) return `${money(loanAmount)} ; Not provided`;
  const pct = (Number(loanAmount) / Number(basis)) * 100;
  return `${money(loanAmount)} ; ${pct.toFixed(1)}%`;
}

// The stable key of the pricing_request template that applies to a given
// loan category — Portfolio has no dedicated template yet, so it falls back
// to the purchase one (closest fit).
export function resolvePricingTemplateKey(loanCategory: string): string {
  if (REFINANCE_CATEGORIES.has(loanCategory)) return "pricing_refinance";
  if (PURCHASE_CATEGORIES.has(loanCategory)) return "pricing_purchase";
  if (loanCategory === "fix_and_flip") return "pricing_fix_and_flip";
  if (loanCategory === "new_construction") return "pricing_new_construction";
  return "pricing_purchase";
}

/** Every merge field a pricing_request template body/subject can reference. */
export async function buildPricingTemplateTokens(
  deal: Deal,
  { repName, senderName, companyName, notes }: { repName: string; senderName: string; companyName: string; notes: string | null }
): Promise<Record<string, string>> {
  const purchasePriceOrAsIs = deal.purchasePrice ?? deal.estimatedAsIsValue;

  return {
    ...(await buildAllDealTokens(deal)),
    repName,
    senderName,
    companyName,
    notesLine: notes ? `\n\nNotes: ${notes}` : "",
    // Pre-existing pricing_request templates reference {{propertyType}} —
    // kept alongside the newer, universal propertyTypeLabel for compatibility.
    propertyType: deal.propertyType ? labelFor(PROPERTY_TYPES, deal.propertyType) : "Not provided",
    ltvOnAsIsValue: ltv(deal.loanAmountRequested, deal.estimatedAsIsValue),
    purchasePriceOrAsIs: money(purchasePriceOrAsIs),
    ltvOnPurchaseOrAsIs: ltv(deal.loanAmountRequested, purchasePriceOrAsIs),
    purchaseOrRefinanceFlip: deal.propertyAlreadyOwned ? "Refinance (delayed purchase)" : "Purchase",
    purchaseOrRefinanceConstruction: deal.propertyAlreadyOwned ? "Refinance (already own land)" : "Purchase",
  };
}

export function renderTemplate(text: string, tokens: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => tokens[key] ?? match);
}

/** Renders the pricing_request template for this deal's category into a ready-to-send subject/body. */
export async function buildPricingEmail(
  deal: Deal,
  {
    repName,
    senderName,
    companyName,
    notes,
  }: { repName: string; senderName: string; companyName: string; notes: string | null }
): Promise<{ subject: string; body: string }> {
  const key = resolvePricingTemplateKey(deal.loanCategory);
  const template = await db.query.emailTemplates.findFirst({
    where: eq(emailTemplates.key, key),
  });

  if (!template || !template.active) {
    throw new Error(
      `Pricing email template "${key}" is missing or inactive — check Email Templates in the sidebar.`
    );
  }

  const tokens = await buildPricingTemplateTokens(deal, { repName, senderName, companyName, notes });
  return {
    subject: renderTemplate(template.subject, tokens),
    body: renderTemplate(template.body, tokens),
  };
}
