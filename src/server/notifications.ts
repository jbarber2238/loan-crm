import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals, notifications, users } from "@/server/db/schema";
import { pushToUsers } from "@/server/push";
import { categoryFor, mayReceive } from "@/lib/notification-categories";

export interface NewNotification {
  type: string;
  title: string;
  body?: string | null;
  href?: string | null;
  dealId?: string | null;
}

/**
 * Inserts one notification per (distinct) recipient who is allowed to have it (see mayReceive: a processor only
 * hears about their own deals and messages to them), then pushes it to their phones and browsers if they've
 * opted in. Never throws into the caller's flow.
 */
export async function createNotifications(userIds: (string | null | undefined)[], n: NewNotification) {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return;
  try {
    const [recipients, deal] = await Promise.all([
      db.select({ id: users.id, isAdmin: users.isAdmin, baseRole: users.baseRole, active: users.active }).from(users).where(inArray(users.id, ids)),
      n.dealId
        ? db.query.deals.findFirst({ where: eq(deals.id, n.dealId), columns: { assignedLoanOfficerId: true, assignedProcessorId: true, assignedAssistantId: true } })
        : Promise.resolve(undefined),
    ]);
    const team = deal ? { loId: deal.assignedLoanOfficerId, procId: deal.assignedProcessorId, asstId: deal.assignedAssistantId } : null;
    const allowed = recipients.filter((r) => mayReceive(r, { type: n.type, dealId: n.dealId ?? null }, team)).map((r) => r.id);
    if (allowed.length === 0) return;
    await db.insert(notifications).values(
      allowed.map((userId) => ({
        userId,
        type: n.type,
        title: n.title,
        body: n.body ?? null,
        href: n.href ?? null,
        dealId: n.dealId ?? null,
      }))
    );
    await pushToUsers(allowed, { title: n.title, body: n.body, href: n.href, category: categoryFor(n.type, Boolean(n.dealId)) });
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
