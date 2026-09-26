"use server";

import { and, desc, eq, isNull, count } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { notifications, users } from "@/server/db/schema";
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

export interface NotificationSoundPrefs {
  soundChat: boolean;
  soundTexts: boolean;
  soundNotifications: boolean;
}

/** Unread totals for the bell, with client texts counted separately so they can chime differently. */
export async function getUnreadNotificationSummary(): Promise<{ total: number; texts: number }> {
  const user = await requireUser();
  const rows = await db
    .select({ type: notifications.type, n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)))
    .groupBy(notifications.type);
  const total = rows.reduce((sum, r) => sum + r.n, 0);
  return { total, texts: rows.find((r) => r.type === "inbound_text")?.n ?? 0 };
}

export async function getMySoundPrefs(): Promise<NotificationSoundPrefs> {
  const user = await requireUser();
  const row = await db.query.users.findFirst({
    where: eq(users.id, user.id),
    columns: { soundChat: true, soundTexts: true, soundNotifications: true },
  });
  return {
    soundChat: row?.soundChat ?? true,
    soundTexts: row?.soundTexts ?? true,
    soundNotifications: row?.soundNotifications ?? true,
  };
}

export async function updateMySoundPrefs(prefs: Partial<NotificationSoundPrefs>) {
  const user = await requireUser();
  const set: Partial<NotificationSoundPrefs> = {};
  if (typeof prefs.soundChat === "boolean") set.soundChat = prefs.soundChat;
  if (typeof prefs.soundTexts === "boolean") set.soundTexts = prefs.soundTexts;
  if (typeof prefs.soundNotifications === "boolean") set.soundNotifications = prefs.soundNotifications;
  if (Object.keys(set).length === 0) return;
  await db.update(users).set(set).where(eq(users.id, user.id));
}
