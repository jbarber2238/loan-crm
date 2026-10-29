import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { emailLogEntries, marketingAlertLog, marketingCampaignSends, marketingSettings } from "@/server/db/schema";
import { notifyAdmins } from "@/server/partner/email";
import { etDay } from "@/lib/friday-schedule";
import { DEFAULT_LIMITS, capStatus, type AccountType, type CapStatus, type SendLimitsInput } from "@/lib/send-limits";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface MarketingLimits {
  accountType: AccountType;
  dailyLimit: number;
  campaignDailyMax: number;
  minDaysBetween: number;
}

export async function getMarketingLimits(): Promise<MarketingLimits> {
  const row = await db.query.marketingSettings.findFirst({ where: eq(marketingSettings.id, "default") });
  if (!row) return DEFAULT_LIMITS;
  return {
    accountType: (["free", "workspace", "custom"].includes(row.accountType) ? row.accountType : "workspace") as AccountType,
    dailyLimit: row.dailyLimit,
    campaignDailyMax: row.campaignDailyMax,
    minDaysBetween: row.minDaysBetween,
  };
}

// Every recipient counts toward Gmail's limit, so a message to three people uses three.
const recipientsSql = sql<number>`coalesce(sum(
  coalesce(array_length(regexp_split_to_array(trim(${emailLogEntries.toEmail}), '\\s*,\\s*'), 1), 1)
  + case when coalesce(${emailLogEntries.ccEmail}, '') = '' then 0 else coalesce(array_length(regexp_split_to_array(trim(${emailLogEntries.ccEmail}), '\\s*,\\s*'), 1), 0) end
), 0)`.mapWith(Number);

/** Emails this Gmail account sent through the CRM in the last 24 hours (everything: campaigns, sequences, deal emails). */
export async function sentLast24h(userId: string, now = new Date()): Promise<{ total: number; campaign: number }> {
  const since = new Date(now.getTime() - DAY_MS);
  const [all] = await db
    .select({ n: recipientsSql })
    .from(emailLogEntries)
    .where(and(eq(emailLogEntries.sentByUserId, userId), gte(emailLogEntries.sentAt, since)));
  const [campaign] = await db
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(marketingCampaignSends)
    .where(and(eq(marketingCampaignSends.status, "sent"), gte(marketingCampaignSends.sentAt, since)));
  return { total: all.n, campaign: campaign.n };
}

export interface CapSnapshot extends SendLimitsInput {
  limits: MarketingLimits;
  status: CapStatus;
}

export async function loadCapSnapshot(userId: string, now = new Date()): Promise<CapSnapshot> {
  const [limits, used] = await Promise.all([getMarketingLimits(), sentLast24h(userId, now)]);
  const input: SendLimitsInput = { used24h: used.total, dailyLimit: limits.dailyLimit, campaignUsed24h: used.campaign, campaignDailyMax: limits.campaignDailyMax };
  return { ...input, limits, status: capStatus(input) };
}

export interface DayCount {
  day: string; // YYYY-MM-DD, Eastern
  total: number;
  campaign: number;
}

/** Emails sent per Eastern calendar day for the last `days` days, oldest first. */
export async function dailyHistory(userId: string, days = 14, now = new Date()): Promise<DayCount[]> {
  const since = new Date(now.getTime() - days * DAY_MS);
  const dayExpr = (col: unknown) => sql<string>`to_char(${col} at time zone 'America/New_York', 'YYYY-MM-DD')`;
  const [all, camp] = await Promise.all([
    db
      .select({ day: dayExpr(emailLogEntries.sentAt), n: recipientsSql })
      .from(emailLogEntries)
      .where(and(eq(emailLogEntries.sentByUserId, userId), gte(emailLogEntries.sentAt, since)))
      .groupBy(dayExpr(emailLogEntries.sentAt)),
    db
      .select({ day: dayExpr(marketingCampaignSends.sentAt), n: sql<number>`count(*)`.mapWith(Number) })
      .from(marketingCampaignSends)
      .where(and(eq(marketingCampaignSends.status, "sent"), gte(marketingCampaignSends.sentAt, since)))
      .groupBy(dayExpr(marketingCampaignSends.sentAt)),
  ]);
  const total = new Map(all.map((r) => [r.day, r.n]));
  const campaign = new Map(camp.map((r) => [r.day, r.n]));
  const out: DayCount[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = etDay(new Date(now.getTime() - i * DAY_MS));
    out.push({ day, total: total.get(day) ?? 0, campaign: campaign.get(day) ?? 0 });
  }
  return out;
}

/**
 * Raises an alert (in the app and by email, to the admins) the first time `key` is seen. Include the Eastern date
 * in the key for a warning that should repeat daily. Returns whether it fired.
 */
export async function raiseAlertOnce(key: string, alert: { title: string; body: string; href?: string }): Promise<boolean> {
  const [claimed] = await db.insert(marketingAlertLog).values({ key }).onConflictDoNothing().returning({ key: marketingAlertLog.key });
  if (!claimed) return false;
  await notifyAdmins({ type: "marketing_alert", title: alert.title, body: alert.body, href: alert.href ?? "/marketing/email-log" });
  return true;
}
