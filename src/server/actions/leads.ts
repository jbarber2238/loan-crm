"use server";

import { headers } from "next/headers";
import { and, desc, eq, gte, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { leads, leadActivities, leadActivityTypeEnum } from "@/server/db/schema";
import { requireAdminOrLoanOfficer } from "@/server/auth/guards";
import { toE164 } from "@/server/twilio-client";
import { computeStatusAfterEvent, type LeadStatus } from "@/lib/lead-scoring";
import { sendMaxOfferExcelEmail, sendBuydownExcelEmail, sendLeadCapturedAlert, sendHotLeadAlert } from "@/server/lead-notifications";
import type { MaxOfferExcelInputs } from "@/lib/max-offer-excel-export";
import { model, money, monthsText, signed, type BuydownInputs } from "@/lib/buydown-calc";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_MAX_PER_IP = 5;
const CALCULATOR_DEBOUNCE_MS = 30 * 1000;

async function getClientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip");
}

type LeadActivityType = (typeof leadActivityTypeEnum.enumValues)[number];

async function logActivity(leadId: string, type: LeadActivityType, metadata?: Record<string, unknown>) {
  await db.insert(leadActivities).values({ leadId, type, metadata: metadata ?? null });
}

async function applyStatusEvent(leadId: string, currentStatus: LeadStatus, event: Parameters<typeof computeStatusAfterEvent>[1]) {
  const nextStatus = computeStatusAfterEvent(currentStatus, event);
  if (!nextStatus || nextStatus === currentStatus) return currentStatus;
  await db.update(leads).set({ status: nextStatus }).where(eq(leads.id, leadId));
  await logActivity(leadId, "status_changed", { from: currentStatus, to: nextStatus, cause: event.kind });
  if (nextStatus === "hot") {
    const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
    if (lead) await sendHotLeadAlert(lead).catch((err) => console.error("Failed to send hot lead alert:", err));
  }
  return nextStatus;
}

/**
 * Public, unauthenticated — the gate on a marketing-site lead magnet.
 * Dedupes by email or phone (updates + logs activity rather than creating a
 * duplicate), rate-limits by IP, and silently "succeeds" on a filled
 * honeypot field so a bot never learns to look for an error to work around.
 */
export async function submitLead(source: string, formData: FormData): Promise<{ leadId: string }> {
  // Honeypot: a real visitor never sees or fills this field (hidden via CSS,
  // not `type="hidden"`, so a bot's basic field-scraper still finds it).
  if (String(formData.get("website") ?? "").trim()) {
    return { leadId: "00000000-0000-0000-0000-000000000000" };
  }

  const firstName = String(formData.get("name") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const name = lastName ? `${firstName} ${lastName}` : firstName;
  const emailRaw = String(formData.get("email") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const consent = formData.get("consent") === "on";

  if (!firstName) throw new Error("Please enter your name.");
  if (!EMAIL_RE.test(emailRaw)) throw new Error("Please enter a valid email address.");
  if (phoneRaw.replace(/\D/g, "").length < 10) throw new Error("Please enter a valid phone number.");
  if (!consent) throw new Error("Please agree to be contacted to continue.");

  const email = emailRaw.toLowerCase();
  const phone = toE164(phoneRaw);
  const ip = await getClientIp();

  if (ip) {
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(leads)
      .where(and(eq(leads.consentIp, ip), gte(leads.createdAt, since)));
    if (Number(count) >= RATE_LIMIT_MAX_PER_IP) {
      throw new Error("Too many submissions — please try again later.");
    }
  }

  const consentText = "I agree to receive emails and phone calls from Manna Lending about my deals and financing options.";
  const now = new Date();

  const existing = await db.query.leads.findFirst({
    where: or(eq(leads.email, email), eq(leads.phone, phone)),
  });

  let leadId: string;
  if (existing) {
    await db
      .update(leads)
      .set({
        name,
        marketingConsent: consent,
        consentText,
        consentIp: ip,
        consentAt: now,
        lastActivityAt: now,
        // Resubmitting the gate form means re-checking the consent box right
        // now — fresh consent supersedes a prior marketing opt-out.
        unsubscribedAt: null,
      })
      .where(eq(leads.id, existing.id));
    leadId = existing.id;
    await logActivity(leadId, "form_submitted", { source, repeat: true });
  } else {
    const [created] = await db
      .insert(leads)
      .values({
        name,
        email,
        phone,
        source,
        marketingConsent: consent,
        consentText,
        consentIp: ip,
        consentAt: now,
      })
      .returning({ id: leads.id });
    leadId = created!.id;
    await logActivity(leadId, "form_submitted", { source });
  }

  return { leadId };
}

// Public, unauthenticated — called right after submitLead succeeds on the
// Max Allowable Offer Calculator's Excel-download gate. Kept separate from
// submitLead itself (a generic, reusable lead-capture function with no
// calculator-specific knowledge) since this needs the calculator's current
// inputs, which the gate form never collects. Also fires the internal
// "new lead" alert here, at the same moment, since this is the one place
// that already has both the lead and its deal-under-contract answer
// together — see sendLeadCapturedAlert for why that's a separate email
// from the conditional hot-lead alert.
export async function sendMaxOfferExcelEmailAction(
  leadId: string,
  inputs: MaxOfferExcelInputs,
  hasDealUnderContract: boolean | null,
  closingTimelineLabel: string | null
): Promise<void> {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) return;
  const calculatorUrl = `https://mannalendingco.com/resources/max-allowable-offer-calculator?lead=${leadId}`;
  await Promise.all([
    sendMaxOfferExcelEmail(lead, inputs, calculatorUrl, hasDealUnderContract).catch((err) =>
      console.error("Failed to send max offer excel email:", err)
    ),
    sendLeadCapturedAlert(lead, hasDealUnderContract, closingTimelineLabel).catch((err) =>
      console.error("Failed to send new lead alert:", err)
    ),
  ]);
}

export interface BuydownDownloadInputs {
  loanAmount: number;
  /** Rates as percentages, e.g. 7.99. */
  rateNoBuydown: number;
  rateWithBuydown: number;
  termYears: number;
  interestOnly: boolean;
  buydownFee: number;
  sameClosingCosts: number;
  holdMonths: number;
  /** The seven hold times on the "By Hold Time" tab, in months. */
  holdTimes: number[];
}

// Public, unauthenticated — called when someone downloads the Rate Buy-Down Calculator's Excel file (the file
// itself is built in their browser). Saves the deal they ran on their lead record, logs the download, and, when
// they have just filled in the form (`justSubmitted`), emails them the same file and sends the internal "new lead"
// alert. Every number is re-checked here and the results are worked out again on the server; nothing a visitor
// typed is trusted as text.
export async function recordBuydownExcelDownload(leadId: string, raw: BuydownDownloadInputs, justSubmitted: boolean): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(String(leadId))) return;
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) return;

  const n = (v: unknown, min: number, max: number) => {
    const x = Number(v);
    return Number.isFinite(x) ? Math.min(max, Math.max(min, x)) : min;
  };
  const inputs = {
    loanAmount: n(raw?.loanAmount, 0, 1e9),
    rateNoBuydown: n(raw?.rateNoBuydown, 0, 100),
    rateWithBuydown: n(raw?.rateWithBuydown, 0, 100),
    termYears: n(raw?.termYears, 1, 50),
    interestOnly: raw?.interestOnly === true,
    buydownFee: n(raw?.buydownFee, 0, 1e9),
    sameClosingCosts: n(raw?.sameClosingCosts, 0, 1e9),
    holdMonths: Math.round(n(raw?.holdMonths, 0, 600)),
  };
  const o: BuydownInputs = {
    L: inputs.loanAmount,
    r0: inputs.rateNoBuydown / 100,
    r1: inputs.rateWithBuydown / 100,
    T: inputs.termYears,
    io: inputs.interestOnly,
    pts: inputs.loanAmount > 0 ? inputs.buydownFee / inputs.loanAmount : 0,
    extra: 0,
    same: inputs.sameClosingCosts,
  };
  const m = model(o);
  const at = m.at(inputs.holdMonths);
  const results = {
    monthlySavings: Math.round(m.save * 100) / 100,
    breakEvenMonths: m.be === null ? null : Math.round(m.be * 10) / 10,
    netBenefitAtHold: Math.round(at.net),
  };

  const now = new Date();
  await db
    .update(leads)
    .set({
      lastCalculatorInputs: { calculator: "rate_buydown", ...inputs },
      lastCalculatorResults: results,
      excelDownloadedAt: now,
      lastActivityAt: now,
    })
    .where(eq(leads.id, leadId));
  await logActivity(leadId, "excel_downloaded", { calculator: "rate_buydown" });
  await applyStatusEvent(leadId, lead.status, { kind: "excel_downloaded" });

  if (!justSubmitted) return;
  const holdTimes = (Array.isArray(raw?.holdTimes) ? raw.holdTimes : []).slice(0, 7).map((k) => Math.round(n(k, 0, 600)));
  while (holdTimes.length < 7) holdTimes.push([6, 12, 24, 36, 60, 84, 120][holdTimes.length]);
  await sendBuydownExcelEmail(lead, o, inputs.holdMonths, holdTimes).catch((err) => console.error("Failed to send buy-down excel email:", err));
  await sendLeadCapturedAlert(lead, null, null, {
    calculator: "Rate Buy-Down Calculator",
    detailLines: [
      `Loan ${money(inputs.loanAmount)}, ${inputs.interestOnly ? "interest-only" : "amortizing"}, ${inputs.termYears} years`,
      `Rate ${inputs.rateNoBuydown}% with no buy-down, ${inputs.rateWithBuydown}% for a ${money(inputs.buydownFee)} fee`,
      `Plans to hold ${inputs.holdMonths} months. Break-even: ${m.be === null ? "never" : `month ${monthsText(m.be)}`}. Net at exit: ${signed(at.net)}`,
    ],
  }).catch((err) => console.error("Failed to send new lead alert:", err));
}

// Public, unauthenticated — lets the emailed "here's your calculator" link
// re-unlock the gate without asking someone to fill out the form a second
// time. Only confirms the id is a real lead (already past the hard consent
// gate at submission); returns no other data.
export async function verifyLeadId(id: string): Promise<boolean> {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, id), columns: { id: true } });
  return Boolean(lead);
}

// Public, unauthenticated — the link in a marketing email's unsubscribe
// footer. Scoped to marketing emails only (see leadMarketingEmailFooter):
// doesn't touch marketingConsent, the hard gate on the calculator, or
// manual phone/email outreach, only whether future marketing-footer emails
// get sent to this lead. Returns the lead's first name for the confirmation
// page's copy; a bogus/already-deleted id just shows a generic confirmation.
export async function unsubscribeLeadFromMarketing(id: string): Promise<{ name: string | null }> {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, id), columns: { name: true, unsubscribedAt: true } });
  if (!lead) return { name: null };
  if (!lead.unsubscribedAt) {
    await db.update(leads).set({ unsubscribedAt: new Date() }).where(eq(leads.id, id));
  }
  return { name: lead.name };
}

// --- Post-unlock event logging -------------------------------------------

export async function logCalculatorUsed(
  leadId: string,
  inputs: Record<string, unknown>,
  results: Record<string, unknown>
): Promise<void> {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) return;

  // Debounced — a slider drag fires this on every change; only the first
  // one in a 30s window is worth a log entry and a status check.
  const lastUse = await db.query.leadActivities.findFirst({
    where: and(eq(leadActivities.leadId, leadId), eq(leadActivities.type, "calculator_used")),
    orderBy: desc(leadActivities.createdAt),
  });
  const debounced = lastUse && Date.now() - lastUse.createdAt.getTime() < CALCULATOR_DEBOUNCE_MS;

  await db
    .update(leads)
    .set({ lastCalculatorInputs: inputs, lastCalculatorResults: results, lastActivityAt: new Date() })
    .where(eq(leads.id, leadId));

  if (debounced) return;
  await logActivity(leadId, "calculator_used", { inputs, results });
  await applyStatusEvent(leadId, lead.status, { kind: "calculator_used" });
}

export async function logExcelDownloaded(leadId: string): Promise<void> {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) return;
  await db.update(leads).set({ excelDownloadedAt: new Date(), lastActivityAt: new Date() }).where(eq(leads.id, leadId));
  await logActivity(leadId, "excel_downloaded");
  await applyStatusEvent(leadId, lead.status, { kind: "excel_downloaded" });
}

export type CtaTier = "below_target" | "getting_close" | "on_target";

export async function logCtaClicked(leadId: string, tier: CtaTier): Promise<void> {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) return;
  await db.update(leads).set({ lastActivityAt: new Date() }).where(eq(leads.id, leadId));
  await logActivity(leadId, "cta_clicked", { tier });
  await applyStatusEvent(leadId, lead.status, { kind: "cta_clicked", tier });
}

export async function submitDealQuestions(
  leadId: string,
  hasDealUnderContract: boolean,
  closingTimelineLabel: string,
  closingTimelineDays: number | null
): Promise<void> {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead) return;

  await db
    .update(leads)
    .set({
      hasDealUnderContract,
      closingTimeline: closingTimelineLabel,
      lastActivityAt: new Date(),
    })
    .where(eq(leads.id, leadId));
  await logActivity(leadId, "deal_question_answered", { hasDealUnderContract, closingTimelineLabel });

  const afterFirst = await applyStatusEvent(leadId, lead.status, { kind: "deal_under_contract", value: hasDealUnderContract });
  await applyStatusEvent(leadId, afterFirst, { kind: "closing_timeline", days: closingTimelineDays });
}

// --- Admin/loan-officer-facing pipeline views -----------------------------

export interface LeadListItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: LeadStatus;
  source: string;
  lastActivityAt: Date;
  createdAt: Date;
  lastCalculatorInputs: unknown;
  lastCalculatorResults: unknown;
}

export async function getLeads(filter?: { status?: LeadStatus; source?: string }): Promise<LeadListItem[]> {
  await requireAdminOrLoanOfficer();
  const conditions = [];
  if (filter?.status) conditions.push(eq(leads.status, filter.status));
  if (filter?.source) conditions.push(eq(leads.source, filter.source));
  return db.query.leads.findMany({
    where: conditions.length ? and(...conditions) : undefined,
    orderBy: desc(leads.lastActivityAt),
  });
}

export interface LeadActivityItem {
  id: string;
  type: string;
  metadata: unknown;
  createdAt: Date;
}

export interface LeadDetail extends LeadListItem {
  marketingConsent: boolean;
  consentText: string | null;
  priorFlip: boolean | null;
  hasDealUnderContract: boolean | null;
  closingTimeline: string | null;
  lastCalculatorInputs: unknown;
  lastCalculatorResults: unknown;
  excelDownloadedAt: Date | null;
  contactedAt: Date | null;
  convertedDealId: string | null;
  activities: LeadActivityItem[];
}

export async function getLeadDetail(id: string): Promise<LeadDetail | null> {
  await requireAdminOrLoanOfficer();
  const lead = await db.query.leads.findFirst({
    where: eq(leads.id, id),
    with: { activities: { orderBy: (a, { desc: descA }) => descA(a.createdAt) } },
  });
  return lead ?? null;
}

export async function updateLeadStatus(id: string, status: LeadStatus): Promise<void> {
  const user = await requireAdminOrLoanOfficer();
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  if (!lead) throw new Error("Lead not found");
  await db.update(leads).set({ status, lastActivityAt: new Date() }).where(eq(leads.id, id));
  await logActivity(id, "status_changed", { from: lead.status, to: status, by: user.id });
  revalidatePath("/pipeline/leads");
}

export async function markContacted(id: string): Promise<void> {
  const user = await requireAdminOrLoanOfficer();
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, id) });
  if (!lead) throw new Error("Lead not found");
  const now = new Date();
  await db.update(leads).set({ status: "contacted", contactedAt: now, lastActivityAt: now }).where(eq(leads.id, id));
  await logActivity(id, "call_logged", { by: user.id });
  revalidatePath("/pipeline/leads");
}
