"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { marketingSettings } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { ACCOUNT_TYPES } from "@/lib/send-limits";

type Result = { ok: true } | { error: string };

export async function saveMarketingLimits(input: { accountType: string; dailyLimit: number; campaignDailyMax: number; minDaysBetween: number }): Promise<Result> {
  await requireAdmin();
  const type = ACCOUNT_TYPES.find((t) => t.value === input.accountType);
  if (!type) return { error: "Pick the kind of email account you send from." };
  const dailyLimit = type.limit ?? Math.round(input.dailyLimit);
  const { campaignDailyMax, minDaysBetween } = input;
  if (!Number.isInteger(dailyLimit) || dailyLimit < 50 || dailyLimit > 100_000) return { error: "The daily limit should be between 50 and 100,000." };
  if (!Number.isInteger(campaignDailyMax) || campaignDailyMax < 1 || campaignDailyMax > dailyLimit) return { error: "Campaigns' daily maximum has to be between 1 and your daily limit." };
  if (!Number.isInteger(minDaysBetween) || minDaysBetween < 0 || minDaysBetween > 60) return { error: "Days between emails should be 0 to 60." };
  await db
    .insert(marketingSettings)
    .values({ id: "default", accountType: type.value, dailyLimit, campaignDailyMax, minDaysBetween })
    .onConflictDoUpdate({ target: marketingSettings.id, set: { accountType: type.value, dailyLimit, campaignDailyMax, minDaysBetween, updatedAt: new Date() } });
  revalidatePath("/marketing/email-log");
  revalidatePath("/marketing");
  return { ok: true };
}
