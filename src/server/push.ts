import webpush from "web-push";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import { notificationPreferences, pushKeys, pushSubscriptions, users } from "@/server/db/schema";
import { attentionCountFor } from "@/server/attention";
import { COMPANY_EMAIL } from "@/lib/lead-constants";
import { pushWanted } from "@/lib/notification-categories";

let configured = false;

/** The server's signing keys for Web Push. Made the first time they're needed and kept in the database. */
export async function getVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  let row = await db.query.pushKeys.findFirst({ where: eq(pushKeys.id, "default") });
  if (!row) {
    const keys = webpush.generateVAPIDKeys();
    await db.insert(pushKeys).values({ id: "default", publicKey: keys.publicKey, privateKey: keys.privateKey }).onConflictDoNothing();
    row = await db.query.pushKeys.findFirst({ where: eq(pushKeys.id, "default") });
  }
  return { publicKey: row!.publicKey, privateKey: row!.privateKey };
}

async function configure() {
  if (configured) return;
  const keys = await getVapidKeys();
  webpush.setVapidDetails(`mailto:${COMPANY_EMAIL}`, keys.publicKey, keys.privateKey);
  configured = true;
}

export interface PushPayload {
  title: string;
  body?: string | null;
  /** Where tapping it goes, as a path inside the app. */
  href?: string | null;
  category: string;
  /** Messages with the same tag replace each other on the phone instead of piling up. */
  tag?: string;
  /** Skip the person's per-category choice (used by the "send me a test" button). */
  force?: boolean;
}

/**
 * Sends a push notification to every device of these people who want that kind of notification. Never throws:
 * a notification that fails to push must not break whatever caused it. Devices that have gone away are removed.
 */
export async function pushToUsers(userIds: string[], payload: PushPayload): Promise<number> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return 0;
  try {
    const subs = await db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, ids));
    if (subs.length === 0) return 0;
    await configure();
    const [prefRows, people] = await Promise.all([
      db.select().from(notificationPreferences).where(inArray(notificationPreferences.userId, ids)),
      db.select({ id: users.id, isAdmin: users.isAdmin }).from(users).where(inArray(users.id, ids)),
    ]);
    const prefsByUser = new Map<string, Map<string, boolean>>();
    for (const p of prefRows) prefsByUser.set(p.userId, (prefsByUser.get(p.userId) ?? new Map()).set(p.category, p.push));
    const wanting = new Set(ids.filter((id) => payload.force || pushWanted(payload.category, prefsByUser.get(id) ?? new Map())));

    const badgeByUser = new Map<string, number>();
    for (const u of people) if (wanting.has(u.id)) badgeByUser.set(u.id, await attentionCountFor(u));

    let sent = 0;
    await Promise.all(
      subs
        .filter((s) => wanting.has(s.userId))
        .map(async (s) => {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              JSON.stringify({ title: payload.title, body: payload.body ?? "", href: payload.href ?? "/notifications", tag: payload.tag, badge: badgeByUser.get(s.userId) ?? 0 }),
              { TTL: 60 * 60 * 12, urgency: "normal" }
            );
            sent++;
            await db.update(pushSubscriptions).set({ lastUsedAt: new Date() }).where(eq(pushSubscriptions.id, s.id));
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
            else console.error("Push failed:", status ?? err);
          }
        })
    );
    return sent;
  } catch (err) {
    console.error("Push error:", err);
    return 0;
  }
}
