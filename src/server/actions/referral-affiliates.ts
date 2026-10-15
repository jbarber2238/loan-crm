import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { referralAffiliates, users } from "@/server/db/schema";
import { appUrl } from "@/server/partner/email";

// Referral links always route to this one loan officer regardless of who
// invited the partner — the only one this brokerage has today. Revisit if
// there's ever more than one and referrals need to be split between them.
export async function getDefaultLoanOfficerId(): Promise<string | null> {
  const loanOfficer = await db.query.users.findFirst({
    where: eq(users.baseRole, "loan_officer"),
    orderBy: (u, { asc }) => asc(u.createdAt),
  });
  return loanOfficer?.id ?? null;
}

/**
 * A partner's shareable links. The short link (/r/<slug>) is the one to hand out;
 * the long intake link and the iframe embed carry the same attribution.
 */
export async function buildPartnerLinks(partner: {
  id: string;
  referralSlug: string | null;
}): Promise<{ shortLink: string | null; intakeLink: string; embedSrc: string; embedSnippet: string } | null> {
  const loanOfficerId = await getDefaultLoanOfficerId();
  if (!loanOfficerId) return null;
  const origin = appUrl();
  const embedOrigin = "https://mannalendingco.com";
  const intakeLink = `${origin}/intake/${loanOfficerId}?aff=${partner.id}`;
  const embedSrc = `${embedOrigin}/embed/intake/${loanOfficerId}?aff=${partner.id}`;
  return {
    shortLink: partner.referralSlug ? `${origin}/r/${partner.referralSlug}` : null,
    intakeLink,
    embedSrc,
    embedSnippet: `<iframe src="${embedSrc}" style="width:100%;max-width:720px;height:2200px;border:none;" title="Loan Inquiry"></iframe>`,
  };
}

export type PartnerRow = typeof referralAffiliates.$inferSelect;
