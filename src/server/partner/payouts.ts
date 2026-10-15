import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals, partnerBorrowers, partnerPayouts, referralAffiliates } from "@/server/db/schema";
import { originationFeeForPoints } from "@/lib/term-sheet-calculations";
import {
  identityFor,
  partnerPayoutAmount,
  payoutRate,
  sameBorrower,
  withinTrailingWindow,
} from "@/lib/partner-comp";
import { logPartnerEvent } from "@/server/partner/events";

type Deal = typeof deals.$inferSelect;

/** The origination fee the deal's approved terms imply, or null before there are approved terms. */
export function dealOriginationFee(deal: Pick<Deal, "approvedLoanAmount" | "originationPointsOverride">): number | null {
  const approved = deal.approvedLoanAmount ? Number(deal.approvedLoanAmount) : 0;
  if (approved <= 0) return null;
  return originationFeeForPoints(approved, deal.originationPointsOverride !== null ? Number(deal.originationPointsOverride) : 2);
}

function dealIdentity(deal: Pick<Deal, "borrowerName" | "borrowerEmail" | "borrowerEntityName">) {
  return identityFor({ name: deal.borrowerName, email: deal.borrowerEmail, entity: deal.borrowerEntityName });
}

/** The partner (if any) who already referred this borrower and is still inside the 24-month trailing window. */
export async function findTrailingPartnerFor(
  deal: Pick<Deal, "id" | "borrowerName" | "borrowerEmail" | "borrowerEntityName">,
  now: Date = new Date()
): Promise<{ partnerId: string; firstFundedAt: Date } | null> {
  const identity = dealIdentity(deal);
  const rows = await db.query.partnerBorrowers.findMany();
  for (const row of rows) {
    if (row.firstDealId === deal.id) continue;
    if (!withinTrailingWindow(row.firstFundedAt, now)) continue;
    const candidate = { name: row.borrowerNameNorm, email: row.borrowerEmailNorm, entity: row.entityNorm };
    if (sameBorrower(identity, candidate)) return { partnerId: row.partnerId, firstFundedAt: row.firstFundedAt };
  }
  return null;
}

/** first vs trailing, decided at funding: a repeat deal only if this partner already has this borrower's first funding on file. */
async function determineKind(partnerId: string, deal: Deal, closedAt: Date): Promise<"first" | "trailing"> {
  const identity = dealIdentity(deal);
  const rows = await db.query.partnerBorrowers.findMany({ where: eq(partnerBorrowers.partnerId, partnerId) });
  for (const row of rows) {
    if (row.firstDealId === deal.id) continue;
    if (row.firstFundedAt >= closedAt) continue;
    if (!withinTrailingWindow(row.firstFundedAt, closedAt)) continue;
    if (sameBorrower(identity, { name: row.borrowerNameNorm, email: row.borrowerEmailNorm, entity: row.entityNorm })) return "trailing";
  }
  return "first";
}

/**
 * Makes sure a referred, closed deal has its ledger row. Creates it (pending) with
 * the rate locked at funding, records the borrower's first-funded date for the
 * trailing window, and readies it if banking and the fee are already in.
 */
export async function ensurePayoutForClosedDeal(dealId: string) {
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal?.referredByAffiliateId) return null;
  const existing = await db.query.partnerPayouts.findFirst({ where: eq(partnerPayouts.dealId, dealId) });
  if (existing) return existing;
  const partner = await db.query.referralAffiliates.findFirst({ where: eq(referralAffiliates.id, deal.referredByAffiliateId) });
  if (!partner) return null;

  const closedAt = deal.closedDate ?? new Date();
  const kind = await determineKind(partner.id, deal, closedAt);
  const rate = payoutRate(kind, partner.tier);
  const feeBasis = deal.brokerFeeCollected ? Number(deal.brokerFeeCollected) : dealOriginationFee(deal);

  const [payout] = await db
    .insert(partnerPayouts)
    .values({
      dealId,
      partnerId: partner.id,
      kind,
      rate: rate.toFixed(2),
      feeBasis: feeBasis !== null ? feeBasis.toFixed(2) : null,
      amount: feeBasis !== null ? partnerPayoutAmount(feeBasis, rate).toFixed(2) : null,
      status: "pending",
      closedDate: closedAt,
      feeReceivedDate: deal.brokerFeeReceivedDate,
    })
    .returning();

  await db.update(deals).set({ partnerPayoutKind: kind }).where(eq(deals.id, dealId));

  if (kind === "first") {
    const identity = dealIdentity(deal);
    await db.insert(partnerBorrowers).values({
      partnerId: partner.id,
      borrowerNameNorm: identity.name,
      borrowerEmailNorm: identity.email,
      entityNorm: identity.entity,
      firstDealId: deal.id,
      firstFundedAt: closedAt,
    });
  }

  await recomputePayoutStatuses(partner.id);
  return payout;
}

/** pending -> ready once banking is on file AND the broker fee has been received. Never the other way. */
export async function recomputePayoutStatuses(partnerId: string): Promise<void> {
  const partner = await db.query.referralAffiliates.findFirst({ where: eq(referralAffiliates.id, partnerId), columns: { bankingReceivedAt: true } });
  if (!partner?.bankingReceivedAt) return;
  const pending = await db.query.partnerPayouts.findMany({
    where: and(eq(partnerPayouts.partnerId, partnerId), eq(partnerPayouts.status, "pending")),
  });
  for (const payout of pending) {
    if (!payout.feeReceivedDate) continue;
    await db.update(partnerPayouts).set({ status: "ready", updatedAt: new Date() }).where(eq(partnerPayouts.id, payout.id));
  }
}

/** Admin: our broker fee landed (wire or mailed check). Finalizes the payout amount from the fee actually collected. */
export async function markBrokerFeeReceived(dealId: string, { collected, date }: { collected: number | null; date: Date }) {
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) throw new Error("Deal not found");
  const feeCollected = collected ?? dealOriginationFee(deal);
  if (feeCollected === null || feeCollected <= 0) {
    throw new Error("Enter the broker fee amount you collected — this deal has no approved terms to calculate it from.");
  }

  await db
    .update(deals)
    .set({ brokerFeeReceivedDate: date, brokerFeeCollected: feeCollected.toFixed(2), updatedAt: new Date() })
    .where(eq(deals.id, dealId));

  const payout = await db.query.partnerPayouts.findFirst({ where: eq(partnerPayouts.dealId, dealId) });
  if (payout) {
    await db
      .update(partnerPayouts)
      .set({
        feeBasis: feeCollected.toFixed(2),
        amount: partnerPayoutAmount(feeCollected, Number(payout.rate)).toFixed(2),
        feeReceivedDate: date,
        updatedAt: new Date(),
      })
      .where(eq(partnerPayouts.id, payout.id));
    await logPartnerEvent(payout.partnerId, "fee_received", { feeCollected }, dealId);
    await recomputePayoutStatuses(payout.partnerId);
  }
}

