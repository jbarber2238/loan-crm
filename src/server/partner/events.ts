import { db } from "@/server/db/client";
import { partnerEvents } from "@/server/db/schema";

export type PartnerEventType =
  | "invited"
  | "nudged"
  | "profile_completed"
  | "signed"
  | "referral_submitted"
  | "stage_change"
  | "banking_submitted"
  | "banking_viewed"
  | "w9_received"
  | "fee_received"
  | "payout_paid"
  | "tier_change"
  | "tier_at_risk"
  | "attribution_changed"
  | "attribution_conflict"
  | "quiet"
  | "migrated"
  | "paused"
  | "resumed";

export async function logPartnerEvent(
  partnerId: string,
  type: PartnerEventType,
  payload?: Record<string, unknown>,
  dealId?: string | null
): Promise<void> {
  await db.insert(partnerEvents).values({ partnerId, type, payload: payload ?? null, dealId: dealId ?? null });
}
