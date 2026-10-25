"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { fail } from "@/lib/action-result";

export type UiTheme = "light" | "dark";

/** The signed-in user's own appearance choice. Light is today's look and the default. */
export async function getMyAppearance(): Promise<{ theme: UiTheme; welcomeSeen: boolean }> {
  const user = await requireUser();
  const row = await db.query.users.findFirst({
    where: eq(users.id, user.id),
    columns: { uiTheme: true, darkModeWelcomeSeenAt: true },
  });
  return { theme: row?.uiTheme === "dark" ? "dark" : "light", welcomeSeen: Boolean(row?.darkModeWelcomeSeenAt) };
}

/** My Profile → Appearance. Applies to this user only. */
export async function setMyTheme(theme: UiTheme) {
  const user = await requireUser();
  if (theme !== "light" && theme !== "dark") return fail("Unknown appearance");
  await db.update(users).set({ uiTheme: theme }).where(eq(users.id, user.id));
  revalidatePath("/", "layout");
  return { theme };
}

/**
 * The one-time welcome dialog: any way of closing it counts as seen, so it never comes back.
 * "Turn on dark mode" also switches the theme; "Maybe later" and the X leave it alone.
 */
export async function finishDarkModeWelcome(turnOn: boolean) {
  const user = await requireUser();
  await db
    .update(users)
    .set({ darkModeWelcomeSeenAt: new Date(), ...(turnOn ? { uiTheme: "dark" } : {}) })
    .where(eq(users.id, user.id));
  revalidatePath("/", "layout");
  return { ok: true as const };
}
