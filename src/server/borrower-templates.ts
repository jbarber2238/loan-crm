import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { emailTemplates } from "@/server/db/schema";
import { LOAN_CATEGORIES, labelFor } from "@/lib/labels";
import { renderTemplate } from "@/server/pricing-templates";
import type { deals } from "@/server/db/schema";

type Deal = typeof deals.$inferSelect;

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

export function buildBorrowerTemplateTokens(
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
): Record<string, string> {
  return {
    borrowerFirstName: firstName(deal.borrowerName),
    borrowerName: deal.borrowerName,
    entityName: deal.borrowerEntityName ?? "Not provided",
    propertyAddress: deal.propertyAddress,
    loanNumber: deal.loanNumber?.toString() ?? "",
    loanPurposeLabel: labelFor(LOAN_CATEGORIES, deal.loanCategory),
    loanAmountRequested: `$${Number(deal.loanAmountRequested).toLocaleString()}`,
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

  const tokens = buildBorrowerTemplateTokens(deal, opts);
  return {
    subject: renderTemplate(template.subject, tokens),
    body: renderTemplate(template.body, tokens),
  };
}
