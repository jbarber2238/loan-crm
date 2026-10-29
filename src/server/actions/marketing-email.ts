"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { emailSchedules, emailTemplates } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { FRIDAY_SCHEDULE_KEYS, validateFridayTime, validateNudgeDelay } from "@/lib/friday-schedule";
import { buildCatalog } from "@/lib/marketing-catalog";
import { DEFAULT_FRIDAY_TIMES } from "@/lib/friday-schedule";
import { DEFAULT_EXPIRES_DAYS, DEFAULT_REMINDER_DAYS } from "@/lib/partner-invite-cadence";

type Result = { ok: true } | { error: string };

function refresh() {
  revalidatePath("/marketing/campaigns");
  revalidatePath("/settings/email-templates");
}

const CLOCK_KEYS: string[] = [FRIDAY_SCHEDULE_KEYS.morningReminder, FRIDAY_SCHEDULE_KEYS.hourBefore, FRIDAY_SCHEDULE_KEYS.tenMinutes, FRIDAY_SCHEDULE_KEYS.rollForward, FRIDAY_SCHEDULE_KEYS.followUp];

/** The emails whose On/Off switch really stops them. */
const TOGGLEABLE = new Set(
  buildCatalog(DEFAULT_FRIDAY_TIMES, { reminderDays: DEFAULT_REMINDER_DAYS, expiresDays: DEFAULT_EXPIRES_DAYS })
    .flatMap((g) => g.emails)
    .filter((e) => e.canToggle)
    .map((e) => e.templateKey)
);

/** Turns one automated email on or off. */
export async function setMarketingEmailActive(templateKey: string, active: boolean): Promise<Result> {
  const user = await requireAdmin();
  if (!TOGGLEABLE.has(templateKey)) return { error: "That email can't be switched off from here." };
  const updated = await db
    .update(emailTemplates)
    .set({ active, updatedByUserId: user.id, updatedAt: new Date() })
    .where(eq(emailTemplates.key, templateKey))
    .returning({ id: emailTemplates.id });
  if (updated.length === 0) return { error: "That email's template wasn't found." };
  refresh();
  return { ok: true };
}

/** Changes the time of day a Friday email goes out (Eastern). */
export async function saveFridayClockTime(templateKey: string, hour: number, minute: number): Promise<Result> {
  const user = await requireAdmin();
  if (!CLOCK_KEYS.includes(templateKey)) return { error: "That email doesn't have a send time." };
  const problem = validateFridayTime(templateKey, hour, minute);
  if (problem) return { error: problem };
  await db
    .insert(emailSchedules)
    .values({ templateKey, sendHour: hour, sendMinute: minute, updatedByUserId: user.id })
    .onConflictDoUpdate({ target: emailSchedules.templateKey, set: { sendHour: hour, sendMinute: minute, updatedByUserId: user.id, updatedAt: new Date() } });
  refresh();
  return { ok: true };
}

/** Changes how many days after the follow-up the partner nudge goes out. */
export async function saveFridayNudgeDelay(days: number): Promise<Result> {
  const user = await requireAdmin();
  const problem = validateNudgeDelay(days);
  if (problem) return { error: problem };
  await db
    .insert(emailSchedules)
    .values({ templateKey: FRIDAY_SCHEDULE_KEYS.nudge, delayDays: days, updatedByUserId: user.id })
    .onConflictDoUpdate({ target: emailSchedules.templateKey, set: { delayDays: days, updatedByUserId: user.id, updatedAt: new Date() } });
  refresh();
  return { ok: true };
}

/** Puts an email back on its built-in send time. */
export async function resetEmailTiming(templateKey: string): Promise<Result> {
  await requireAdmin();
  await db.delete(emailSchedules).where(eq(emailSchedules.templateKey, templateKey));
  refresh();
  return { ok: true };
}
