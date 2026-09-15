import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { emailTemplates } from "@/server/db/schema";
import { renderTemplate } from "@/server/pricing-templates";
import { buildAllDealTokens } from "@/server/deal-tokens";
import type { deals } from "@/server/db/schema";

type Deal = typeof deals.$inferSelect;

export async function buildBorrowerTemplateTokens(
  deal: Deal,
  {
    assignedLoanOfficerName,
    companyName,
    senderName,
    extra,
  }: {
    assignedLoanOfficerName: string;
    companyName: string;
    senderName: string;
    extra?: Record<string, string>;
  }
): Promise<Record<string, string>> {
  return {
    ...(await buildAllDealTokens(deal)),
    assignedLoanOfficerName,
    companyName,
    senderName,
    ...extra,
  };
}

/** Renders a borrower_lifecycle template (by its stable key) for this deal into a ready-to-send subject/body. */
export async function buildBorrowerEmail(
  key: string,
  deal: Deal,
  opts: {
    assignedLoanOfficerName: string;
    companyName: string;
    senderName: string;
    extra?: Record<string, string>;
  }
): Promise<{ subject: string; body: string }> {
  const template = await db.query.emailTemplates.findFirst({
    where: eq(emailTemplates.key, key),
  });

  if (!template || !template.active) {
    throw new Error(
      `Borrower email template "${key}" is missing or inactive — check Email Templates in the sidebar.`
    );
  }

  const tokens = await buildBorrowerTemplateTokens(deal, opts);
  return {
    subject: renderTemplate(template.subject, tokens),
    body: renderTemplate(template.body, tokens),
  };
}
