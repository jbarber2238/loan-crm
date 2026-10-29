import { and, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { emailLogEntries, emailSchedules, fridaySends } from "@/server/db/schema";
import { TEMPLATE_KEY, getFridayTimes } from "@/server/friday";
import { getInviteSettings } from "@/server/partner/invite";
import { buildCatalog, type CatalogGroup } from "@/lib/marketing-catalog";
import { FRIDAY_SCHEDULE_KEYS, type ClockTime } from "@/lib/friday-schedule";
import type { EmailTemplateCategory } from "@/lib/email-template-tokens";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface MarketingEmailRow {
  email: CatalogGroup["emails"][number];
  /** Null when the template row doesn't exist (yet). */
  template: {
    id: string;
    key: string;
    name: string;
    category: EmailTemplateCategory;
    subject: string;
    body: string;
    triggerStage: string | null;
    active: boolean;
  } | null;
  /** The send time in effect, for emails that go out at a time of day. */
  clock: ClockTime | null;
  /** The wait in effect, for the follow-up nudge. */
  delayDays: number | null;
  /** True when a saved time/delay is replacing the built-in default. */
  customized: boolean;
  sentLast30Days: number | null;
  lastSentAt: string | null;
}

export interface MarketingGroupView {
  id: CatalogGroup["id"];
  title: string;
  summary: string;
  sentLast30Days: number | null;
  rows: MarketingEmailRow[];
  partner?: { reminderDays: string; expiresDays: number };
}

/** Everything the Marketing Email page shows: the catalog, with live on/off state, saved times and send counts. */
export async function getMarketingOverview(now: Date = new Date()): Promise<MarketingGroupView[]> {
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [times, partner, templates, overrides, fridayStats, logStats] = await Promise.all([
    getFridayTimes(),
    getInviteSettings(),
    db.query.emailTemplates.findMany(),
    db.select({ templateKey: emailSchedules.templateKey }).from(emailSchedules),
    db
      .select({
        kind: fridaySends.kind,
        recent: sql<number>`count(*) filter (where ${fridaySends.sentAt} >= ${since.toISOString()}::timestamptz)`.mapWith(Number),
        last: sql<Date | null>`max(${fridaySends.sentAt})`.mapWith((v) => (v ? new Date(v) : null)),
      })
      .from(fridaySends)
      .groupBy(fridaySends.kind),
    db
      .select({ category: emailLogEntries.category, recent: sql<number>`count(*)`.mapWith(Number), last: sql<Date | null>`max(${emailLogEntries.sentAt})`.mapWith((v) => (v ? new Date(v) : null)) })
      .from(emailLogEntries)
      .where(and(gte(emailLogEntries.sentAt, since), inArray(emailLogEntries.category, ["friday_zoom", "referral_affiliate"])))
      .groupBy(emailLogEntries.category),
  ]);

  const byKey = new Map(templates.map((t) => [t.key, t]));
  const customized = new Set(overrides.map((o) => o.templateKey));
  const kindByTemplateKey = new Map(Object.entries(TEMPLATE_KEY).map(([kind, key]) => [key, kind]));
  const fridayByKind = new Map(fridayStats.map((s) => [s.kind, s]));
  const logByCategory = new Map(logStats.map((s) => [s.category, s]));

  const clocks: Record<string, ClockTime> = {
    [FRIDAY_SCHEDULE_KEYS.morningReminder]: times.morningReminder,
    [FRIDAY_SCHEDULE_KEYS.hourBefore]: times.hourBefore,
    [FRIDAY_SCHEDULE_KEYS.tenMinutes]: times.tenMinutes,
    [FRIDAY_SCHEDULE_KEYS.rollForward]: times.rollForward,
    [FRIDAY_SCHEDULE_KEYS.followUp]: times.followUp,
  };

  return buildCatalog(times, { reminderDays: partner.reminderDays, expiresDays: partner.expiresDays }).map((group) => ({
    id: group.id,
    title: group.title,
    summary: group.summary,
    sentLast30Days: group.logCategory ? (logByCategory.get(group.logCategory)?.recent ?? 0) : null,
    partner: group.id === "partner" ? { reminderDays: partner.reminderDays.join(", "), expiresDays: partner.expiresDays } : undefined,
    rows: group.emails.map((email) => {
      const t = byKey.get(email.templateKey);
      const stat = group.id === "friday" ? fridayByKind.get(kindByTemplateKey.get(email.templateKey) ?? "") : undefined;
      return {
        email,
        template: t
          ? { id: t.id, key: t.key, name: t.name, category: t.category as EmailTemplateCategory, subject: t.subject, body: t.body, triggerStage: t.triggerStage, active: t.active }
          : null,
        clock: clocks[email.templateKey] ?? null,
        delayDays: email.templateKey === FRIDAY_SCHEDULE_KEYS.nudge ? times.nudgeDelayDays : null,
        customized: customized.has(email.templateKey),
        sentLast30Days: group.id === "friday" ? (stat?.recent ?? 0) : null,
        lastSentAt: stat?.last ? stat.last.toISOString() : null,
      };
    }),
  }));
}
