import { and, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals, leads, marketingContactTags, marketingContacts, referralAffiliates } from "@/server/db/schema";
import { consentState, emailKey, isEmailable, sourceLabel, type AudiencePerson } from "@/lib/marketing-audience";

const dayText = (d: Date) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }).format(d);

/**
 * Everyone we hold an email address for, from leads, borrowers (loan files), partners and people added by hand,
 * merged by email into one person each. Consent is worked out per person; nobody is dropped for lacking it, so
 * the Audiences page can show who hasn't agreed yet. Use isEmailable to get the people a campaign may reach.
 */
export async function loadAllPeople(): Promise<AudiencePerson[]> {
  const [leadRows, dealRows, partnerRows, contactRows, tagRows] = await Promise.all([
    db.select().from(leads).where(ne(leads.email, "")),
    db
      .select({
        name: deals.borrowerName,
        email: deals.borrowerEmail,
        phone: deals.borrowerPhone,
        stage: deals.stage,
        loanCategory: deals.loanCategory,
        createdAt: deals.createdAt,
      })
      .from(deals)
      .where(and(isNotNull(deals.borrowerEmail), isNull(deals.deletedAt))),
    db
      .select({ email: referralAffiliates.email, name: referralAffiliates.name, phone: referralAffiliates.phone, status: referralAffiliates.status, createdAt: referralAffiliates.createdAt })
      .from(referralAffiliates),
    db.select().from(marketingContacts),
    db.select({ email: marketingContactTags.email, tag: marketingContactTags.tag }).from(marketingContactTags),
  ]);

  const people = new Map<string, AudiencePerson>();
  const consentInputs = new Map<string, { leadConsent: boolean; leadUnsubscribed: boolean; contactConsent: boolean; contactUnsubscribed: boolean; contactBounced: boolean }>();
  const leadNotes = new Map<string, string>();

  const ensure = (rawEmail: string, name: string, phone: string, joined: Date): AudiencePerson | null => {
    const key = emailKey(rawEmail);
    if (!key) return null;
    let p = people.get(key);
    if (!p) {
      p = {
        key,
        name: "",
        email: key,
        phone: "",
        consent: "not_agreed",
        consentNote: null,
        consentSource: null,
        contactId: null,
        isLead: false,
        source: null,
        role: null,
        leadStatus: null,
        fridayStatus: null,
        fridayEmailOnly: false,
        monthlyList: false,
        usedCalculator: false,
        downloadedExcel: false,
        becameDeal: false,
        closedDeals: 0,
        openDeals: 0,
        loanTypes: [],
        latestDealStage: null,
        partner: null,
        addedManually: false,
        joinedAt: joined.toISOString(),
        manualTags: [],
      };
      people.set(key, p);
      consentInputs.set(key, { leadConsent: false, leadUnsubscribed: false, contactConsent: false, contactUnsubscribed: false, contactBounced: false });
    }
    if (!p.name.trim() && name.trim()) p.name = name.trim();
    if (!p.phone.trim() && phone.trim()) p.phone = phone.trim();
    if (joined.toISOString() < p.joinedAt) p.joinedAt = joined.toISOString();
    return p;
  };

  for (const l of leadRows) {
    const p = ensure(l.email, l.name, l.phone, l.createdAt);
    if (!p) continue;
    p.isLead = true;
    p.source = l.source;
    p.role = l.role;
    p.leadStatus = l.status;
    p.fridayStatus = l.fridayStatus;
    p.fridayEmailOnly = l.fridayEmailOnly;
    p.monthlyList = l.monthlyList;
    p.usedCalculator = l.lastCalculatorInputs !== null;
    p.downloadedExcel = l.excelDownloadedAt !== null;
    p.becameDeal = l.convertedDealId !== null;
    const c = consentInputs.get(p.key)!;
    c.leadConsent = l.marketingConsent;
    c.leadUnsubscribed = l.unsubscribedAt !== null;
    if (l.marketingConsent) leadNotes.set(p.key, `Agreed on the ${sourceLabel(l.source)} form${l.consentAt ? ` on ${dayText(l.consentAt)}` : ""}`);
  }

  const latestDeal = new Map<string, Date>();
  for (const d of dealRows) {
    const p = ensure(d.email ?? "", d.name, d.phone ?? "", d.createdAt);
    if (!p) continue;
    if (d.stage === "closed") p.closedDeals++;
    else p.openDeals++;
    if (!p.loanTypes.includes(d.loanCategory)) p.loanTypes.push(d.loanCategory);
    const seen = latestDeal.get(p.key);
    if (!seen || d.createdAt > seen) {
      latestDeal.set(p.key, d.createdAt);
      p.latestDealStage = d.stage;
    }
  }

  for (const a of partnerRows) {
    const p = ensure(a.email, a.name ?? "", a.phone ?? "", a.createdAt);
    if (!p) continue;
    p.partner = a.status === "legacy" ? null : a.status === "active" || a.status === "paused" ? "signed" : "invited";
  }

  for (const c of contactRows) {
    const p = ensure(c.email, c.name, c.phone, c.createdAt);
    if (!p) continue;
    p.contactId = c.id;
    p.addedManually = p.addedManually || c.addedManually;
    const input = consentInputs.get(p.key)!;
    input.contactConsent = c.marketingConsent;
    input.contactUnsubscribed = c.unsubscribedAt !== null;
    input.contactBounced = c.bouncedAt !== null;
    if (c.marketingConsent) {
      p.consentSource = c.consentSource;
      const when = c.consentAt ? ` on ${dayText(c.consentAt)}` : "";
      p.consentNote =
        c.consentSource === "follow_up"
          ? `Agreed in a personal follow-up${when}`
          : c.consentSource === "manual"
            ? `Added by hand as agreed${when}`
            : `Recorded by staff${when}${c.consentNote ? `: ${c.consentNote}` : ""}`;
    }
  }

  for (const t of tagRows) people.get(emailKey(t.email))?.manualTags.push(t.tag);

  for (const [key, p] of people) {
    p.consent = consentState(consentInputs.get(key)!);
    if (p.consent === "agreed" && !p.consentNote) p.consentNote = leadNotes.get(key) ?? "Agreed to marketing";
    if (p.consent !== "agreed") p.consentNote = null;
    p.manualTags.sort();
  }
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));
}

/** The people a campaign is allowed to email. */
export async function loadEmailablePeople(): Promise<AudiencePerson[]> {
  return (await loadAllPeople()).filter(isEmailable);
}

/** Makes sure a marketing_contacts row exists for this email (without changing anyone's consent), and returns its id. */
export async function ensureContactId(email: string, name: string, phone: string): Promise<string> {
  const key = emailKey(email);
  await db.insert(marketingContacts).values({ email: key, name, phone }).onConflictDoNothing();
  const row = await db.query.marketingContacts.findFirst({ where: eq(marketingContacts.email, key), columns: { id: true } });
  return row!.id;
}
