// Who a marketing email can go to, how people are tagged, and how a group of them is picked.
// Pure (no database) so the rules are testable. Only people with recorded marketing consent who haven't
// unsubscribed can ever be in a list; see isEligible.

export interface AudiencePerson {
  id: string;
  name: string;
  email: string;
  phone: string;
  /** The funnel that brought them in, e.g. "friday_zoom". */
  source: string;
  role: string | null;
  /** Lead pipeline status: new, engaged, hot, contacted, nurture, converted, dead. */
  status: string;
  fridayStatus: string | null;
  fridayEmailOnly: boolean;
  monthlyList: boolean;
  usedCalculator: boolean;
  downloadedExcel: boolean;
  becameDeal: boolean;
  /** "signed" = active or paused partner; "invited" = invited or still setting up. */
  partner: "signed" | "invited" | null;
  /** ISO date-time they joined. */
  joinedAt: string;
  /** Tags added by hand or by a campaign, as typed (lower-case). */
  manualTags: string[];
}

/** The consent rule: they agreed to marketing, haven't unsubscribed, and there's an address to send to. */
export function isEligible(lead: { marketingConsent: boolean; unsubscribedAt: Date | null; email: string | null | undefined }): boolean {
  return lead.marketingConsent && !lead.unsubscribedAt && Boolean(lead.email?.trim());
}

const SOURCE_LABELS: Record<string, string> = {
  friday_zoom: "Friday Zoom",
  max_allowable_offer_calculator: "Max Offer Calculator",
};

export function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const FRIDAY_LABELS: Record<string, string> = { registered: "Registered", attended: "Attended", no_show: "No-show" };
export const FRIDAY_OPTIONS = Object.entries(FRIDAY_LABELS).map(([value, label]) => ({ value, label }));

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  engaged: "Engaged",
  hot: "Hot",
  contacted: "Contacted",
  nurture: "Nurture",
  converted: "Converted",
  dead: "Dead",
};
export const STATUS_OPTIONS = Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }));

/** Tags worked out from what we already know about someone. They can't be edited; they change as the person does. */
export function deriveTags(p: AudiencePerson): string[] {
  const tags = [`Funnel: ${sourceLabel(p.source)}`];
  if (p.role) tags.push(`Role: ${p.role}`);
  if (p.fridayStatus && FRIDAY_LABELS[p.fridayStatus]) tags.push(`Friday: ${FRIDAY_LABELS[p.fridayStatus]}`);
  if (p.fridayEmailOnly) tags.push("Friday: Email-only");
  if (p.monthlyList) tags.push("Monthly list");
  if (STATUS_LABELS[p.status]) tags.push(`Lead: ${STATUS_LABELS[p.status]}`);
  if (p.usedCalculator) tags.push("Used calculator");
  if (p.downloadedExcel) tags.push("Downloaded Excel");
  if (p.becameDeal) tags.push("Became a deal");
  if (p.partner === "signed") tags.push("Partner: Signed");
  if (p.partner === "invited") tags.push("Partner: Invited");
  return tags;
}

export function allTags(p: AudiencePerson): string[] {
  return [...deriveTags(p), ...p.manualTags];
}

export interface AudienceFilters {
  sources: string[];
  roles: string[];
  statuses: string[];
  friday: string[];
  partner: "any" | "signed" | "not_signed";
  becameDeal: "any" | "yes" | "no";
  /** Has at least one of these tags (derived or manual). */
  tags: string[];
  joinedFrom: string | null; // YYYY-MM-DD
  joinedTo: string | null;
  search: string;
}

export const EMPTY_FILTERS: AudienceFilters = {
  sources: [],
  roles: [],
  statuses: [],
  friday: [],
  partner: "any",
  becameDeal: "any",
  tags: [],
  joinedFrom: null,
  joinedTo: null,
  search: "",
};

const norm = (s: string) => s.trim().toLowerCase();

/** Within one group any choice matches; across groups everything must match. An empty group doesn't filter. */
export function matchesFilters(p: AudiencePerson, f: AudienceFilters): boolean {
  if (f.sources.length && !f.sources.includes(p.source)) return false;
  if (f.roles.length && !(p.role && f.roles.includes(p.role))) return false;
  if (f.statuses.length && !f.statuses.includes(p.status)) return false;
  if (f.friday.length && !(p.fridayStatus && f.friday.includes(p.fridayStatus))) return false;
  if (f.partner === "signed" && p.partner !== "signed") return false;
  if (f.partner === "not_signed" && p.partner === "signed") return false;
  if (f.becameDeal === "yes" && !p.becameDeal) return false;
  if (f.becameDeal === "no" && p.becameDeal) return false;
  if (f.tags.length) {
    const mine = new Set(allTags(p).map(norm));
    if (!f.tags.some((t) => mine.has(norm(t)))) return false;
  }
  const day = p.joinedAt.slice(0, 10);
  if (f.joinedFrom && day < f.joinedFrom) return false;
  if (f.joinedTo && day > f.joinedTo) return false;
  const q = norm(f.search);
  if (q && !`${p.name} ${p.email}`.toLowerCase().includes(q)) return false;
  return true;
}

export function applyFilters(people: AudiencePerson[], f: AudienceFilters): AudiencePerson[] {
  return people.filter((p) => matchesFilters(p, f));
}

export function hasAnyFilter(f: AudienceFilters): boolean {
  return JSON.stringify(f) !== JSON.stringify(EMPTY_FILTERS);
}

/** "Funnel: Friday Zoom, attended" style summary for a saved audience. */
export function describeFilters(f: AudienceFilters): string {
  const parts: string[] = [];
  if (f.sources.length) parts.push(f.sources.map(sourceLabel).join(" or "));
  if (f.roles.length) parts.push(f.roles.join(" or "));
  if (f.statuses.length) parts.push(`lead ${f.statuses.map((s) => STATUS_LABELS[s] ?? s).join(" or ").toLowerCase()}`);
  if (f.friday.length) parts.push(`Friday ${f.friday.map((s) => FRIDAY_LABELS[s] ?? s).join(" or ").toLowerCase()}`);
  if (f.partner === "signed") parts.push("signed partners");
  if (f.partner === "not_signed") parts.push("not signed partners");
  if (f.becameDeal === "yes") parts.push("became a deal");
  if (f.becameDeal === "no") parts.push("no deal yet");
  if (f.tags.length) parts.push(`tagged ${f.tags.join(" or ")}`);
  if (f.joinedFrom || f.joinedTo) parts.push(`joined ${f.joinedFrom ?? "…"} to ${f.joinedTo ?? "now"}`);
  if (f.search.trim()) parts.push(`matching "${f.search.trim()}"`);
  return parts.length ? parts.join(" · ") : "Everyone eligible";
}

/** A tag typed by hand: trimmed, lower-case, 2 to 40 letters/numbers/spaces/dashes/colons. Null if unusable. */
export function normalizeTag(raw: string): string | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, " ");
  return t.length >= 2 && t.length <= 40 && /^[a-z0-9][a-z0-9 :_-]*$/.test(t) ? t : null;
}

/** How many people have each value, most common first: powers the filter choices. */
export function countBy(people: AudiencePerson[], pick: (p: AudiencePerson) => string | null): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of people) {
    const v = pick(p);
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}
