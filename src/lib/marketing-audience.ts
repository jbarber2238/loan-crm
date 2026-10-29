// Who a marketing email can go to, how people are tagged, and the lists they fall into.
// Pure (no database) so the rules are testable. Only people who agreed to marketing and haven't
// unsubscribed can ever be emailed; see isEmailable.

import { LOAN_CATEGORIES, STAGES } from "@/lib/labels";

export type ConsentState = "agreed" | "not_agreed" | "unsubscribed";

export interface AudiencePerson {
  /** Lower-case email: the one thing that makes someone the same person across leads, borrowers and partners. */
  key: string;
  name: string;
  email: string;
  phone: string;
  consent: ConsentState;
  /** Plain English for where the consent came from, e.g. "Agreed on the Friday form". Null when not agreed. */
  consentNote: string | null;
  /** Where the consent was recorded, when it was recorded by staff: staff | follow_up | manual. */
  consentSource: string | null;
  /** The marketing_contacts row (holds staff-recorded consent and the unsubscribe link). Null until one exists. */
  contactId: string | null;
  isLead: boolean;
  /** The funnel that brought a lead in, e.g. "friday_zoom". */
  source: string | null;
  role: string | null;
  /** Lead pipeline status: new, engaged, hot, contacted, nurture, converted, dead. */
  leadStatus: string | null;
  fridayStatus: string | null;
  fridayEmailOnly: boolean;
  monthlyList: boolean;
  usedCalculator: boolean;
  downloadedExcel: boolean;
  becameDeal: boolean;
  closedDeals: number;
  /** Deals this person submitted that haven't closed (any stage but Closed). */
  openDeals: number;
  /** Loan categories (values) across their deals. */
  loanTypes: string[];
  /** Stage (value) of their most recent deal. */
  latestDealStage: string | null;
  /** "signed" = active or paused partner; "invited" = invited or still setting up. */
  partner: "signed" | "invited" | null;
  addedManually: boolean;
  /** ISO date-time they first appeared in the system. */
  joinedAt: string;
  /** Tags added by hand or by a campaign, as typed (lower-case). */
  manualTags: string[];
}

/** The consent rule: someone is mailable only when they agreed (anywhere) and no opt-out exists (anywhere). */
export function consentState(a: { leadConsent: boolean; leadUnsubscribed: boolean; contactConsent: boolean; contactUnsubscribed: boolean }): ConsentState {
  if (a.leadUnsubscribed || a.contactUnsubscribed) return "unsubscribed";
  return a.leadConsent || a.contactConsent ? "agreed" : "not_agreed";
}

export function isEmailable(p: Pick<AudiencePerson, "consent" | "email">): boolean {
  return p.consent === "agreed" && Boolean(p.email.trim());
}

const SOURCE_LABELS: Record<string, string> = {
  friday_zoom: "Friday Zoom",
  max_allowable_offer_calculator: "Max Offer Calculator",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const FRIDAY_LABELS: Record<string, string> = { registered: "Registered", attended: "Attended", no_show: "No-show" };

const LEAD_STATUS_LABELS: Record<string, string> = {
  new: "New",
  engaged: "Engaged",
  hot: "Hot",
  contacted: "Contacted",
  nurture: "Nurture",
  converted: "Converted",
  dead: "Dead",
};

const stageLabel = (v: string) => STAGES.find((s) => s.value === v)?.label ?? v;
const loanLabel = (v: string) => LOAN_CATEGORIES.find((c) => c.value === v)?.label ?? v;

/** Tags worked out from what we already know about someone. They can't be edited; they change as the person does. */
export function deriveTags(p: AudiencePerson): string[] {
  const tags: string[] = [];
  if (p.isLead && p.source) tags.push(`Funnel: ${sourceLabel(p.source)}`);
  if (p.role) tags.push(`Role: ${p.role}`);
  if (p.fridayStatus && FRIDAY_LABELS[p.fridayStatus]) tags.push(`Friday: ${FRIDAY_LABELS[p.fridayStatus]}`);
  if (p.fridayEmailOnly) tags.push("Friday: Email-only");
  if (p.monthlyList) tags.push("Monthly list");
  if (p.leadStatus && LEAD_STATUS_LABELS[p.leadStatus]) tags.push(`Lead: ${LEAD_STATUS_LABELS[p.leadStatus]}`);
  if (p.usedCalculator) tags.push("Used calculator");
  if (p.downloadedExcel) tags.push("Downloaded Excel");
  if (p.becameDeal) tags.push("Became a deal");
  if (p.closedDeals > 0) tags.push("Borrower: Closed");
  else if (p.openDeals > 0) tags.push("Borrower: Not closed yet");
  if (p.closedDeals + p.openDeals > 0 && p.latestDealStage) tags.push(`Deal stage: ${stageLabel(p.latestDealStage)}`);
  for (const t of p.loanTypes) tags.push(`Loan: ${loanLabel(t)}`);
  if (p.partner === "signed") tags.push("Partner: Signed");
  if (p.partner === "invited") tags.push("Partner: Invited");
  if (p.addedManually) tags.push("Added by hand");
  if (p.consentSource === "follow_up") tags.push("Agreed in a follow-up");
  return tags;
}

export function allTags(p: AudiencePerson): string[] {
  return [...deriveTags(p), ...p.manualTags];
}

const norm = (s: string) => s.trim().toLowerCase();

// ---- the lists ---------------------------------------------------------------------------------

export interface AudienceDef {
  key: string;
  group: string;
  label: string;
  description: string;
  test: (p: AudiencePerson) => boolean;
}

export const BUILT_IN_AUDIENCES: AudienceDef[] = [
  { key: "all", group: "Everyone", label: "Everyone who agreed to marketing", description: "Every lead, borrower, partner and contact on the list.", test: () => true },
  { key: "borrowers_closed", group: "Borrowers", label: "Borrowers who closed a loan with us", description: "Anyone with a deal that reached Closed.", test: (p) => p.closedDeals > 0 },
  { key: "borrowers_open", group: "Borrowers", label: "Borrowers who submitted but haven't closed", description: "Submitted a deal, none of which has closed.", test: (p) => p.closedDeals === 0 && p.openDeals > 0 },
  { key: "borrowers_all", group: "Borrowers", label: "All borrowers", description: "Closed or not.", test: (p) => p.closedDeals + p.openDeals > 0 },
  { key: "leads", group: "Leads and funnels", label: "All leads", description: "Everyone who came in through a funnel or the calculator.", test: (p) => p.isLead },
  { key: "friday_registered", group: "Leads and funnels", label: "Friday Zoom: everyone who registered", description: "See It, Send It, Get Paid registrants.", test: (p) => p.source === "friday_zoom" },
  { key: "friday_attended", group: "Leads and funnels", label: "Friday Zoom: attended", description: "Joined a session.", test: (p) => p.fridayStatus === "attended" },
  { key: "friday_no_show", group: "Leads and funnels", label: "Friday Zoom: registered but didn't show", description: "Missed a session.", test: (p) => p.fridayStatus === "no_show" },
  { key: "friday_not_partners", group: "Leads and funnels", label: "Friday Zoom: not partners yet", description: "Came through the Friday Zoom and haven't signed up as a partner.", test: (p) => p.source === "friday_zoom" && p.partner !== "signed" },
  { key: "calculator", group: "Leads and funnels", label: "Used the calculator", description: "Ran numbers in a calculator.", test: (p) => p.usedCalculator },
  { key: "partners_signed", group: "Partners", label: "Signed referral partners", description: "Active or paused partners.", test: (p) => p.partner === "signed" },
  { key: "partners_invited", group: "Partners", label: "Invited partners who haven't finished", description: "Invited, still setting up.", test: (p) => p.partner === "invited" },
  { key: "manual", group: "Yours", label: "People I added by hand", description: "Added on this page or in the Follow Up Assistant.", test: (p) => p.addedManually },
];

export const TAG_AUDIENCE_PREFIX = "tag:";
export const tagAudienceKey = (tag: string) => `${TAG_AUDIENCE_PREFIX}${norm(tag)}`;

/** Everyone in a list, including people who haven't agreed (the page shows them separately). Null for an unknown list. */
export function audienceMembers(key: string, people: AudiencePerson[]): AudiencePerson[] | null {
  if (key.startsWith(TAG_AUDIENCE_PREFIX)) {
    const tag = key.slice(TAG_AUDIENCE_PREFIX.length);
    return people.filter((p) => allTags(p).some((t) => norm(t) === tag));
  }
  const def = BUILT_IN_AUDIENCES.find((a) => a.key === key);
  return def ? people.filter(def.test) : null;
}

export interface AudienceOption {
  key: string;
  group: string;
  label: string;
  description: string;
  /** People on the list who agreed and haven't unsubscribed: the ones a campaign can reach. */
  eligible: number;
  /** People who'd be on the list but haven't agreed to marketing. */
  notAgreed: number;
}

/** Every pickable list with its counts: the built-in lists, then one per tag. */
export function audienceOptions(people: AudiencePerson[]): AudienceOption[] {
  const count = (members: AudiencePerson[]) => ({
    eligible: members.filter(isEmailable).length,
    notAgreed: members.filter((p) => p.consent === "not_agreed").length,
  });
  const options: AudienceOption[] = BUILT_IN_AUDIENCES.map((a) => ({
    key: a.key,
    group: a.group,
    label: a.label,
    description: a.description,
    ...count(people.filter(a.test)),
  }));
  const byTag = new Map<string, { label: string; members: AudiencePerson[] }>();
  for (const p of people) {
    for (const t of new Set(allTags(p))) {
      const k = norm(t);
      const entry = byTag.get(k) ?? { label: t, members: [] };
      entry.members.push(p);
      byTag.set(k, entry);
    }
  }
  for (const [k, { label, members }] of [...byTag.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label))) {
    options.push({ key: tagAudienceKey(k), group: "By tag", label: `Tag: ${label}`, description: `Everyone tagged "${label}".`, ...count(members) });
  }
  return options;
}

export function audienceLabel(key: string, options: AudienceOption[]): string {
  return options.find((o) => o.key === key)?.label ?? "Unknown list";
}

// ---- tags typed by hand --------------------------------------------------------------------------

/** A tag typed by hand: trimmed, lower-case, 2 to 40 letters/numbers/spaces/dashes/colons. Null if unusable. */
export function normalizeTag(raw: string): string | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return t.length >= 2 && t.length <= 40 && /^[a-z0-9][a-z0-9 :_-]*$/.test(t) ? t : null;
}

/** A person's email as the system keys it. */
export function emailKey(email: string): string {
  return email.trim().toLowerCase();
}

export function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// ---- export ------------------------------------------------------------------------------------------

function csvCell(v: string): string {
  // A cell that starts with = + - @ can run as a formula when the file is opened in a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const CONSENT_LABEL: Record<ConsentState, string> = { agreed: "Agreed", not_agreed: "Not agreed", unsubscribed: "Unsubscribed" };

export function peopleToCsv(people: AudiencePerson[]): string {
  const header = ["Name", "Email", "Phone", "Marketing", "Tags"];
  const rows = people.map((p) => [p.name, p.email, p.phone, CONSENT_LABEL[p.consent], allTags(p).join("; ")]);
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}
