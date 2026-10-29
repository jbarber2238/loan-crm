"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { notificationPreferences, pushSubscriptions } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { attentionCountFor } from "@/server/attention";
import { getVapidKeys, pushToUsers } from "@/server/push";
import { categoriesFor, pushWanted } from "@/lib/notification-categories";

export interface PushSetup {
  publicKey: string;
  /** How many devices (phones, browsers) are signed up to get push. */
  devices: number;
  isAdmin: boolean;
  categories: { id: string; label: string; description: string; on: boolean }[];
}

export async function getPushSetup(): Promise<PushSetup> {
  const user = await requireUser();
  const [keys, subs, prefRows] = await Promise.all([
    getVapidKeys(),
    db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id)),
    db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, user.id)),
  ]);
  const chosen = new Map(prefRows.map((p) => [p.category, p.push]));
  return {
    publicKey: keys.publicKey,
    devices: subs.length,
    isAdmin: user.isAdmin,
    categories: categoriesFor(user.isAdmin).map((c) => ({ id: c.id, label: c.label, description: c.description, on: pushWanted(c.id, chosen) })),
  };
}

interface BrowserSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Remembers this device for the signed-in person. The same device signing in as someone else moves to them. */
export async function savePushSubscription(sub: BrowserSubscription, userAgent: string): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) return { error: "That device couldn't be registered." };
  await db
    .insert(pushSubscriptions)
    .values({ userId: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent.slice(0, 300) })
    .onConflictDoUpdate({ target: pushSubscriptions.endpoint, set: { userId: user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent.slice(0, 300) } });
  revalidatePath("/settings/notifications");
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<{ ok: true }> {
  const user = await requireUser();
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, user.id), eq(pushSubscriptions.endpoint, endpoint)));
  revalidatePath("/settings/notifications");
  return { ok: true };
}

export async function setPushPreference(category: string, on: boolean): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  if (!categoriesFor(user.isAdmin).some((c) => c.id === category)) return { error: "That kind of notification isn't available to you." };
  await db
    .insert(notificationPreferences)
    .values({ userId: user.id, category, push: on })
    .onConflictDoUpdate({ target: [notificationPreferences.userId, notificationPreferences.category], set: { push: on } });
  revalidatePath("/settings/notifications");
  return { ok: true };
}

/** Sends a test push to all of this person's devices, ignoring their per-kind choices. Returns how many devices it reached. */
export async function sendTestPush(): Promise<{ sent: number }> {
  const user = await requireUser();
  const sent = await pushToUsers([user.id], { title: "Notifications are on", body: "This is a test from your CRM.", href: "/settings/notifications", category: "deals", tag: "test", force: true });
  return { sent };
}

/** The number on the browser tab and the home-screen icon: unread notifications plus unread team chat. */
export async function getAttentionCount(): Promise<number> {
  const user = await requireUser();
  return attentionCountFor(user);
}
