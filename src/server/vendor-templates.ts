import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { emailTemplates } from "@/server/db/schema";
import { renderTemplate } from "@/server/pricing-templates";
import { originationFeeForPoints, effectiveCostToBorrowerFee } from "@/lib/term-sheet-calculations";
import { buildAllDealTokens } from "@/server/deal-tokens";
import type { deals } from "@/server/db/schema";

type Deal = typeof deals.$inferSelect;

async function renderByKey(key: string, tokens: Record<string, string>): Promise<{ subject: string; body: string }> {
  const template = await db.query.emailTemplates.findFirst({ where: eq(emailTemplates.key, key) });
  if (!template || !template.active) {
    throw new Error(`Email template "${key}" is missing or inactive — check Email Templates in the sidebar.`);
  }
  return { subject: renderTemplate(template.subject, tokens), body: renderTemplate(template.body, tokens) };
}

/** Every merge field the insurance_request / title_request templates can reference. */
export async function buildKeyDateOrderTemplateTokens(
  deal: Deal,
  {
    contactName,
    senderName,
    senderEmail,
    companyName,
  }: { contactName: string | null; senderName: string; senderEmail: string; companyName: string }
): Promise<Record<string, string>> {
  const contactFirstName = contactName?.trim().split(/\s+/)[0] || "there";
  return {
    ...(await buildAllDealTokens(deal)),
    contactFirstName,
    senderName,
    senderEmail,
    companyName,
  };
}

export async function buildKeyDateOrderEmail(
  item: "insurance" | "title",
  deal: Deal,
  opts: { contactName: string | null; senderName: string; senderEmail: string; companyName: string }
): Promise<{ subject: string; body: string }> {
  const key = item === "insurance" ? "key_date_insurance_order" : "key_date_title_order";
  return renderByKey(key, await buildKeyDateOrderTemplateTokens(deal, opts));
}

// The one line item that must always be present: proceed at whatever
// rate/buydown the lender quoted, and state the origination fee plainly —
// generated fresh from the deal's own numbers every time a template
// references {{termsParagraph}}, never left to hand-typed text to remember.
export function buildTermsParagraph(deal: {
  loanCategory: string;
  finalRate: string | null;
  costToBorrowerFee: string | null;
  rateBuydownPointsOverride: string | null;
  approvedLoanAmount: string | null;
  originationPointsOverride: string | null;
}): string {
  const rate = deal.finalRate ? `${Number(deal.finalRate)}%` : "the quoted rate";
  const loanAmount = deal.approvedLoanAmount ? Number(deal.approvedLoanAmount) : null;
  const effectiveBuydownFee = effectiveCostToBorrowerFee(
    deal.loanCategory,
    loanAmount ?? 0,
    deal.costToBorrowerFee ? Number(deal.costToBorrowerFee) : null,
    deal.rateBuydownPointsOverride !== null ? Number(deal.rateBuydownPointsOverride) : null
  );
  const buydown = effectiveBuydownFee
    ? `a $${Math.round(effectiveBuydownFee).toLocaleString()} rate buydown`
    : "no rate buydown";
  const points = deal.originationPointsOverride !== null ? Number(deal.originationPointsOverride) : 2;
  const fee = loanAmount ? originationFeeForPoints(loanAmount, points) : null;

  return `We'd like to proceed at ${rate} interest with ${buydown}, as quoted. Our origination fee will be ${points}% of the loan amount${
    fee ? ` ($${Math.round(fee).toLocaleString()})` : ""
  }, or $2,500 — whichever is greater.`;
}

/** Every merge field the application_submission template can reference. */
export async function buildApplicationSubmissionTemplateTokens(
  deal: Deal,
  { repName, senderName, companyName }: { repName: string; senderName: string; companyName: string }
): Promise<Record<string, string>> {
  return {
    ...(await buildAllDealTokens(deal)),
    repName: repName.trim().split(/\s+/)[0] || repName,
    senderName,
    companyName,
    termsParagraph: buildTermsParagraph(deal),
  };
}

export async function buildApplicationSubmissionEmail(
  deal: Deal,
  opts: { repName: string; senderName: string; companyName: string }
): Promise<{ subject: string; body: string }> {
  return renderByKey("application_submission", await buildApplicationSubmissionTemplateTokens(deal, opts));
}

/**
 * Merge fields available in a lender's own custom intro subject/body
 * (Lenders → Submission & Pricing → Intro Email Template). Deliberately
 * excludes {{termsParagraph}} — that line is always appended after this
 * custom text separately, so exposing the same token here would risk it
 * appearing twice if someone typed it in by hand.
 */
export async function buildApplicationIntroTemplateTokens(
  deal: Deal,
  { repName, senderName, companyName }: { repName: string; senderName: string; companyName: string }
): Promise<Record<string, string>> {
  return {
    ...(await buildAllDealTokens(deal)),
    repName: repName.trim().split(/\s+/)[0] || repName,
    senderName,
    companyName,
  };
}
