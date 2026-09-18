import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals, phoneStageRouting, phoneUnmatchedRouting, users } from "@/server/db/schema";
import { getTcpaOutboundWindow } from "@/server/settings";

// Inbound/outbound call & text routing (see "Borrower texting & calling" in
// the multi-tenant plan doc). Kept as plain, mostly-pure functions separate
// from the Twilio webhooks that call them, so the actual routing decisions
// are easy to reason about and test without a real Twilio request.

export type PhoneRoutingRole = "loan_officer" | "processor";

/** A deal's stage decides which role bucket an inbound call/text routes to — admin-editable at Settings → Phone. */
export async function getStageTargetRole(stage: string): Promise<PhoneRoutingRole> {
  const row = await db.query.phoneStageRouting.findFirst({ where: eq(phoneStageRouting.stage, stage as never) });
  // Safe default if a stage is somehow missing a row (shouldn't happen —
  // every dealStageEnum value is seeded — but this bucket is the more
  // conservative one: it never routes a call to the processor by accident).
  return row?.targetRole ?? "loan_officer";
}

export interface DealForRouting {
  stage: string;
  assignedLoanOfficerId: string | null;
  assignedAssistantId: string | null;
  assignedProcessorId: string | null;
}

/**
 * The ordered list of user IDs to try for this deal, given which role
 * bucket its stage routes to. "loan_officer" bucket tries the loan officer
 * assistant first, escalating to the loan officer — never the processor.
 * "processor" bucket is just the assigned processor, if one exists.
 */
export function candidateOrderForStage(deal: DealForRouting, targetRole: PhoneRoutingRole): string[] {
  if (targetRole === "processor") {
    return deal.assignedProcessorId ? [deal.assignedProcessorId] : [];
  }
  return [deal.assignedAssistantId, deal.assignedLoanOfficerId].filter((id): id is string => Boolean(id));
}

/** The full routing chain for an inbound call/text to a matched deal: role-appropriate staff, then the unmatched-call fallback list as a last resort. */
export async function resolveInboundRouteCandidates(deal: DealForRouting): Promise<string[]> {
  const targetRole = await getStageTargetRole(deal.stage);
  const primary = candidateOrderForStage(deal, targetRole);
  const fallback = await resolveUnmatchedRouteUserIds();
  // De-duped, primary chain first — the fallback list only adds someone not
  // already in the primary chain (most commonly this is just Justin).
  return [...primary, ...fallback.filter((id) => !primary.includes(id))];
}

/** The configured fallback chain for a call/text that doesn't match any deal at all. */
export async function resolveUnmatchedRouteUserIds(): Promise<string[]> {
  const rows = await db.query.phoneUnmatchedRouting.findMany({ orderBy: asc(phoneUnmatchedRouting.sortOrder) });
  return rows.map((r) => r.userId);
}

export async function loadDealForRouting(dealId: string): Promise<DealForRouting | null> {
  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    columns: { stage: true, assignedLoanOfficerId: true, assignedAssistantId: true, assignedProcessorId: true },
  });
  return deal ?? null;
}

export interface RoutingCandidateUser {
  id: string;
  phone: string | null;
  inboundHoursStart: string | null;
  inboundHoursEnd: string | null;
}

/** Resolves an ordered list of user IDs down to the users who are actually reachable right now — has a phone on file, and it's currently within their own inbound hours (or they haven't set any, meaning always reachable). */
export async function reachableCandidatesInOrder(userIds: string[], now: Date): Promise<RoutingCandidateUser[]> {
  if (!userIds.length) return [];
  const rows = await db.query.users.findMany({
    where: inArray(users.id, userIds),
    columns: { id: true, phone: true, inboundHoursStart: true, inboundHoursEnd: true },
  });
  const byId = new Map(rows.map((u) => [u.id, u]));
  return userIds
    .map((id) => byId.get(id))
    .filter((u): u is RoutingCandidateUser => Boolean(u?.phone))
    .filter((u) => isWithinWindow(u.inboundHoursStart, u.inboundHoursEnd, now));
}

/** "HH:MM:SS" (as Postgres `time` columns come back through the driver) → minutes since midnight. */
function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Whether `now` falls inside a [start, end) window, treating a missing
 * start/end as "no restriction configured" (always reachable) rather than
 * "never reachable." Handles an overnight window (e.g. 22:00-06:00) as a
 * wraparound, though personal hours aren't expected to actually need that.
 */
export function isWithinWindow(start: string | null, end: string | null, now: Date): boolean {
  if (!start || !end) return true;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  if (startMinutes <= endMinutes) return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

/**
 * A user's own outbound window intersected with the org's TCPA-safe ceiling
 * — the user's setting can only narrow the legal window, never widen it.
 * Falls back to the ceiling alone if the user hasn't set a personal
 * preference, and to a hardcoded conservative default if the org hasn't
 * configured a ceiling yet (shouldn't happen once Settings → Phone is set
 * up once, but outbound calling should never be fully unrestricted).
 */
export async function getEffectiveOutboundWindow(
  userStart: string | null,
  userEnd: string | null
): Promise<{ start: string; end: string }> {
  const ceiling = (await getTcpaOutboundWindow()) ?? { start: "08:00:00", end: "21:00:00" };
  const start = userStart && userStart > ceiling.start ? userStart : ceiling.start;
  const end = userEnd && userEnd < ceiling.end ? userEnd : ceiling.end;
  return { start, end };
}
