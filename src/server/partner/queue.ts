import { ne } from "drizzle-orm";
import { db } from "@/server/db/client";
import { partnerPayouts } from "@/server/db/schema";
import { dealOriginationFee } from "@/server/partner/payouts";

export interface PayoutQueueItem {
  id: string;
  dealId: string;
  partnerName: string;
  street: string;
  borrower: string;
  amount: number | null;
  status: "pending" | "ready";
  feeReceived: boolean;
  suggestedFee: number | null;
  waitingOn: string | null; // what a pending payout is blocked on, in plain words
}

/** Every referral payout that isn't paid yet: the ready ones first, then what each other one is waiting on. */
export async function getPartnerPayoutQueue(): Promise<PayoutQueueItem[]> {
  const rows = await db.query.partnerPayouts.findMany({
    where: ne(partnerPayouts.status, "paid"),
    orderBy: (p, { asc }) => asc(p.createdAt),
    with: {
      deal: {
        columns: {
          id: true,
          propertyAddress: true,
          borrowerName: true,
          brokerFeeReceivedDate: true,
          approvedLoanAmount: true,
          originationPointsOverride: true,
        },
      },
      partner: { columns: { name: true, email: true, bankingReceivedAt: true, w9ReceivedAt: true } },
    },
  });

  const items = rows.map((r): PayoutQueueItem => {
    const missing = [!r.partner.bankingReceivedAt && "ACH details", !r.partner.w9ReceivedAt && "W-9"].filter(Boolean).join(" + ");
    return {
      id: r.id,
      dealId: r.deal.id,
      partnerName: r.partner.name ?? r.partner.email,
      street: r.deal.propertyAddress.split(",")[0].trim(),
      borrower: r.deal.borrowerName,
      amount: r.amount ? Number(r.amount) : null,
      status: r.status === "ready" ? "ready" : "pending",
      feeReceived: Boolean(r.deal.brokerFeeReceivedDate),
      suggestedFee: dealOriginationFee(r.deal),
      waitingOn: r.status === "ready" ? null : r.deal.brokerFeeReceivedDate ? `Partner's ${missing || "details"}` : "Our broker fee",
    };
  });
  return [...items.filter((i) => i.status === "ready"), ...items.filter((i) => i.status !== "ready")];
}
