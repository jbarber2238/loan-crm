// The kinds of notification, who may receive each, and who a notification is allowed to reach. Pure.

export interface NotificationCategory {
  id: string;
  label: string;
  description: string;
  /** Only admins ever receive these, so only admins see the switch. */
  adminOnly: boolean;
  /** Whether push is on until the person says otherwise. */
  defaultPush: boolean;
}

export const NOTIFICATION_CATEGORIES: NotificationCategory[] = [
  { id: "deals", label: "Activity on my deals", description: "Documents uploaded, term sheets accepted, the processing fee paid and other updates on deals I'm assigned to.", adminOnly: false, defaultPush: true },
  { id: "texts", label: "Texts from clients", description: "A client texts one of my deals.", adminOnly: false, defaultPush: true },
  { id: "chat_direct", label: "Team chat: messages to me", description: "Direct messages, group chats I'm in, and chats on my deals.", adminOnly: false, defaultPush: true },
  { id: "chat_general", label: "Team chat: the General room", description: "Every message in the team-wide chat. Busy, so it's off until you want it.", adminOnly: false, defaultPush: false },
  { id: "leads", label: "Event signups and leads", description: "Someone registers for the Friday Zoom or becomes a lead.", adminOnly: true, defaultPush: true },
  { id: "partners", label: "Partner activity", description: "Partners accepting terms, sending referrals, sending banking or tax forms.", adminOnly: true, defaultPush: true },
  { id: "reviews", label: "Client reviews", description: "A client finishes the closing survey.", adminOnly: true, defaultPush: true },
  { id: "marketing", label: "Marketing and follow-ups", description: "Follow-up reminders, sending-limit and campaign health alerts.", adminOnly: true, defaultPush: true },
  { id: "system", label: "Problems that need attention", description: "Something broke or needs a decision, such as a Zoom error.", adminOnly: true, defaultPush: true },
];

const TYPE_TO_CATEGORY: Record<string, string> = {
  client_needs_completed: "deals",
  client_needs_note: "deals",
  term_sheet_accepted: "deals",
  processing_fee_paid: "deals",
  borrower_submission: "deals",
  stage_change: "deals",
  need_added: "deals",
  need_cleared: "deals",
  license_required: "deals",
  inbound_text: "texts",
  direct_message: "chat_direct",
  group_message: "chat_direct",
  general_message: "chat_general",
  friday_signup: "leads",
  friday_headcount: "leads",
  partner_terms_accepted: "partners",
  partner_referral: "partners",
  partner_banking_submitted: "partners",
  partner_w9: "partners",
  partner_quiet: "partners",
  partner_attribution_conflict: "partners",
  closing_survey: "reviews",
  marketing_alert: "marketing",
  follow_up_due: "marketing",
  friday_zoom_error: "system",
};

/** The category a notification belongs to; anything unrecognised is a deal update if it's about a deal, otherwise a "problem". */
export function categoryFor(type: string, hasDeal: boolean): string {
  return TYPE_TO_CATEGORY[type] ?? (hasDeal ? "deals" : "system");
}

export function categoriesFor(isAdmin: boolean): NotificationCategory[] {
  return NOTIFICATION_CATEGORIES.filter((c) => isAdmin || !c.adminOnly);
}

/** Whether push should go out for this category, given what the person has chosen (a missing choice means the default). */
export function pushWanted(category: string, chosen: Map<string, boolean>): boolean {
  const c = NOTIFICATION_CATEGORIES.find((x) => x.id === category);
  return chosen.get(category) ?? c?.defaultPush ?? false;
}

// ---- who may be told ---------------------------------------------------------------------------------

export interface Recipient {
  id: string;
  isAdmin: boolean;
  baseRole: string;
  active: boolean;
}

export interface DealTeam {
  loId: string | null;
  procId: string | null;
  asstId: string | null;
}

/** Types that are sent to one person on purpose (a message to them), so they always go through. */
const DIRECT_TYPES = new Set(["direct_message", "group_message"]);

/**
 * The one rule for who a notification may reach. Admins and loan officers are told whatever they're sent. A
 * processor is only told about deals they're assigned to, and about messages sent to them: never marketing,
 * signups, partner activity or anything else about the business.
 */
export function mayReceive(r: Recipient, n: { type: string; dealId: string | null }, deal: DealTeam | null): boolean {
  if (!r.active) return false;
  if (r.isAdmin || r.baseRole !== "processor") return true;
  if (DIRECT_TYPES.has(n.type)) return true;
  if (!n.dealId || !deal) return false;
  return [deal.loId, deal.procId, deal.asstId].includes(r.id);
}
