"use server";

import { and, desc, eq, isNull, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { notifications } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";

export async function getUnreadNotificationCount(): Promise<number> {
  const user = await requireUser();
  const [row] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

export async function listMyNotifications(limit = 100) {
  const user = await requireUser();
  return db.query.notifications.findMany({
    where: eq(notifications.userId, user.id),
    orderBy: desc(notifications.createdAt),
    limit,
  });
}

export async function markNotificationRead(id: string) {
  const user = await requireUser();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, user.id), isNull(notifications.readAt)));
  revalidatePath("/notifications");
}

export async function markAllNotificationsRead() {
  const user = await requireUser();
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
  revalidatePath("/notifications");
}
