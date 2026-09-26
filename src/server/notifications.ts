import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals, notifications, users } from "@/server/db/schema";

export interface NewNotification {
  type: string;
  title: string;
  body?: string | null;
  href?: string | null;
  dealId?: string | null;
}

/** Inserts one notification per (distinct) recipient. Never throws into the caller's flow. */
export async function createNotifications(userIds: (string | null | undefined)[], n: NewNotification) {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return;
  try {
    await db.insert(notifications).values(
      ids.map((userId) => ({
        userId,
        type: n.type,
        title: n.title,
        body: n.body ?? null,
        href: n.href ?? null,
        dealId: n.dealId ?? null,
      }))
    );
  } catch (err) {
    console.error("Failed to create notification:", err);
  }
}

/** The people working a deal: its loan officer and (if assigned) processor. */
export async function dealTeamUserIds(dealId: string, opts: { includeProcessor?: boolean } = {}) {
  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    columns: { assignedLoanOfficerId: true, assignedProcessorId: true, borrowerName: true, propertyAddress: true },
  });
  if (!deal) return null;
  const includeProcessor = opts.includeProcessor ?? true;
  return {
    borrowerName: deal.borrowerName,
    propertyAddress: deal.propertyAddress,
    userIds: [deal.assignedLoanOfficerId, includeProcessor ? deal.assignedProcessorId : null],
  };
}

export async function activeAdminIds(): Promise<string[]> {
  const admins = await db.query.users.findMany({
    where: eq(users.isAdmin, true),
    columns: { id: true, active: true },
  });
  return admins.filter((a) => a.active).map((a) => a.id);
}
