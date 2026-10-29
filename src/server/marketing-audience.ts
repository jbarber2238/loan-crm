import { and, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals, leadTags, leads, marketingAudiences, referralAffiliates } from "@/server/db/schema";
import { isEligible, type AudienceFilters, type AudiencePerson, EMPTY_FILTERS } from "@/lib/marketing-audience";

/** Everyone a marketing email is allowed to go to: consent recorded, not unsubscribed, with their tags. */
export async function loadEligiblePeople(): Promise<AudiencePerson[]> {
  const [rows, partners, tagRows] = await Promise.all([
    db.select().from(leads).where(and(eq(leads.marketingConsent, true), isNull(leads.unsubscribedAt), ne(leads.email, ""))),
    db.select({ email: referralAffiliates.email, status: referralAffiliates.status }).from(referralAffiliates),
    db.select({ leadId: leadTags.leadId, tag: leadTags.tag }).from(leadTags),
  ]);
  const partnerByEmail = new Map(partners.map((p) => [p.email.trim().toLowerCase(), p.status]));
  const tagsByLead = new Map<string, string[]>();
  for (const t of tagRows) tagsByLead.set(t.leadId, [...(tagsByLead.get(t.leadId) ?? []), t.tag]);

  return rows
    .filter(isEligible)
    .map((l): AudiencePerson => {
      const status = partnerByEmail.get(l.email.trim().toLowerCase());
      return {
        id: l.id,
        name: l.name,
        email: l.email,
        phone: l.phone,
        source: l.source,
        role: l.role,
        status: l.status,
        fridayStatus: l.fridayStatus,
        fridayEmailOnly: l.fridayEmailOnly,
        monthlyList: l.monthlyList,
        usedCalculator: l.lastCalculatorInputs !== null,
        downloadedExcel: l.excelDownloadedAt !== null,
        becameDeal: l.convertedDealId !== null,
        partner: !status || status === "legacy" ? null : status === "active" || status === "paused" ? "signed" : "invited",
        joinedAt: l.createdAt.toISOString(),
        manualTags: (tagsByLead.get(l.id) ?? []).sort(),
      };
    })
    .sort((a, b) => b.joinedAt.localeCompare(a.joinedAt));
}

export interface EligibilitySummary {
  eligibleLeads: number;
  unsubscribed: number;
  noConsentLeads: number;
  /** Groups we hold email addresses for but have no marketing consent recorded for, so they can't be mailed. */
  notEligible: { label: string; count: number; reason: string }[];
}

export async function getEligibilitySummary(eligibleLeads: number): Promise<EligibilitySummary> {
  const [leadCounts] = await db
    .select({
      unsubscribed: sql<number>`count(*) filter (where ${leads.unsubscribedAt} is not null)`.mapWith(Number),
      noConsent: sql<number>`count(*) filter (where ${leads.marketingConsent} = false)`.mapWith(Number),
    })
    .from(leads);
  const [borrowers] = await db
    .select({ count: sql<number>`count(distinct lower(${deals.borrowerEmail}))`.mapWith(Number) })
    .from(deals)
    .where(and(isNotNull(deals.borrowerEmail), isNull(deals.deletedAt)));
  const [partners] = await db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(referralAffiliates);
  return {
    eligibleLeads,
    unsubscribed: leadCounts.unsubscribed,
    noConsentLeads: leadCounts.noConsent,
    notEligible: [
      { label: "Borrowers", count: borrowers.count, reason: "Their emails come from loan files; no marketing consent is recorded." },
      { label: "Partners", count: partners.count, reason: "Partner emails are for the program itself; no marketing consent is recorded." },
    ],
  };
}

export interface SavedAudience {
  id: string;
  name: string;
  filters: AudienceFilters;
}

export async function loadSavedAudiences(): Promise<SavedAudience[]> {
  const rows = await db.select().from(marketingAudiences).orderBy(marketingAudiences.createdAt);
  return rows.map((r) => ({ id: r.id, name: r.name, filters: { ...EMPTY_FILTERS, ...(r.filters as Partial<AudienceFilters>) } }));
}
