"use server";

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { companySettings, phoneStageRouting, phoneUnmatchedRouting, dealStageEnum } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { TCPA_ABSOLUTE_START, TCPA_ABSOLUTE_END, timeAtOrAfter, timeAtOrBefore } from "@/lib/tcpa";

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function updateTwilioSettings(formData: FormData) {
  await requireAdmin();
  const accountSid = str(formData, "twilioAccountSid");
  const authToken = str(formData, "twilioAuthToken");
  const phoneNumber = str(formData, "twilioPhoneNumber");

  const updates: Record<string, string> = {};
  if (accountSid) updates.twilioAccountSid = accountSid;
  if (authToken) updates.twilioAuthToken = authToken;
  if (phoneNumber) updates.twilioPhoneNumber = phoneNumber;
  if (!Object.keys(updates).length) return;

  await db
    .insert(companySettings)
    .values({ id: "default", name: "", ...updates })
    .onConflictDoUpdate({ target: companySettings.id, set: { ...updates, updatedAt: new Date() } });

  revalidatePath("/settings/phone");
}

export async function disconnectTwilio() {
  await requireAdmin();
  await db
    .update(companySettings)
    .set({ twilioAccountSid: null, twilioAuthToken: null, twilioPhoneNumber: null, updatedAt: new Date() })
    .where(eq(companySettings.id, "default"));
  revalidatePath("/settings/phone");
}

export async function updateTcpaWindow(formData: FormData) {
  await requireAdmin();
  const start = str(formData, "tcpaOutboundStart");
  const end = str(formData, "tcpaOutboundEnd");
  if (!start || !end) throw new Error("Both a start and end time are required");

  // The client's own min/max on these inputs already block this — this is
  // the server-side backstop against anyone bypassing that (a direct form
  // submission, a stale page). TCPA's 8am–9pm safe harbor is a hard
  // ceiling, not a per-org preference.
  if (!timeAtOrAfter(start, TCPA_ABSOLUTE_START)) {
    throw new Error(`Can't start earlier than ${TCPA_ABSOLUTE_START} — that's TCPA's own outer limit.`);
  }
  if (!timeAtOrBefore(end, TCPA_ABSOLUTE_END)) {
    throw new Error(`Can't end later than ${TCPA_ABSOLUTE_END} — that's TCPA's own outer limit.`);
  }
  if (!timeAtOrAfter(end, start)) {
    throw new Error("End time must be after the start time");
  }

  await db
    .insert(companySettings)
    .values({ id: "default", name: "", tcpaOutboundStart: start, tcpaOutboundEnd: end })
    .onConflictDoUpdate({
      target: companySettings.id,
      set: { tcpaOutboundStart: start, tcpaOutboundEnd: end, updatedAt: new Date() },
    });

  revalidatePath("/settings/phone");
}

const STAGE_VALUES = dealStageEnum.enumValues;

/** One <select> per stage on the Phone settings page, named `role_<stage>`. */
export async function updateStageRouting(formData: FormData) {
  await requireAdmin();
  for (const stage of STAGE_VALUES) {
    const role = str(formData, `role_${stage}`);
    if (role !== "loan_officer" && role !== "processor") continue;
    await db
      .insert(phoneStageRouting)
      .values({ stage, targetRole: role })
      .onConflictDoUpdate({ target: phoneStageRouting.stage, set: { targetRole: role } });
  }
  revalidatePath("/settings/phone");
}

export async function addUnmatchedRoutingUser(formData: FormData) {
  await requireAdmin();
  const userId = str(formData, "userId");
  if (!userId) return;

  const existing = await db.query.phoneUnmatchedRouting.findMany();
  if (existing.some((r) => r.userId === userId)) return;

  const maxSort = existing.reduce((max, r) => Math.max(max, r.sortOrder), -1);
  await db.insert(phoneUnmatchedRouting).values({ userId, sortOrder: maxSort + 1 });
  revalidatePath("/settings/phone");
}

export async function removeUnmatchedRoutingUser(id: string) {
  await requireAdmin();
  await db.delete(phoneUnmatchedRouting).where(eq(phoneUnmatchedRouting.id, id));
  revalidatePath("/settings/phone");
}

/** Swaps this row's position with the one directly before/after it in the fallback order. */
export async function moveUnmatchedRoutingUser(id: string, direction: "up" | "down") {
  await requireAdmin();
  const rows = await db.query.phoneUnmatchedRouting.findMany({ orderBy: asc(phoneUnmatchedRouting.sortOrder) });
  const index = rows.findIndex((r) => r.id === id);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || swapWith < 0 || swapWith >= rows.length) return;

  const a = rows[index];
  const b = rows[swapWith];
  await db.update(phoneUnmatchedRouting).set({ sortOrder: b.sortOrder }).where(eq(phoneUnmatchedRouting.id, a.id));
  await db.update(phoneUnmatchedRouting).set({ sortOrder: a.sortOrder }).where(eq(phoneUnmatchedRouting.id, b.id));
  revalidatePath("/settings/phone");
}
