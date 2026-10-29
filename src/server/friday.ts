import { and, eq, gte, isNotNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { emailTemplates, fridaySends, fridaySessions, leadActivities, leads, referralAffiliates, users } from "@/server/db/schema";
import { sendGmailAs } from "@/server/gmail/send";
import { getCompanyLogoHtml } from "@/server/settings";
import { getUserEmailSignatureHtml } from "@/server/users";
import { renderTemplate } from "@/server/pricing-templates";
import { activeAdminIds, createNotifications } from "@/server/notifications";
import { appUrl, notifyAdmins } from "@/server/partner/email";
import { issuePartnerSetupLink } from "@/server/partner/invite";
import { attendedEmails, isZoomConfigured, registerForMeeting } from "@/server/zoom";
import { leadMarketingEmailFooter } from "@/lib/lead-email-footer";
import { htmlButton, plainTextToHtmlWithBlocks } from "@/lib/email-html";
import { afterAttended, afterNoShow, splitByAttendance, undoNoShow } from "@/lib/friday-sequence";
import {
  FINAL_REMINDER_ET,
  FOLLOWUP_HOUR_ET,
  HEADCOUNT_HOUR_ET,
  HOUR_BEFORE_REMINDER_ET,
  MORNING_REMINDER_HOUR_ET,
  ROLL_FORWARD_HOUR_ET,
  addDays,
  buildIcs,
  etDay,
  etParts,
  formatSession,
  googleCalendarUrl,
  isAtOrAfterEt,
  isAtOrAfterEtTime,
  latestSessionDayBefore,
  nextSessionDay,
} from "@/lib/friday-schedule";
import { toE164 } from "@/server/twilio-client";
import { FRIDAY_CONSENT_TEXT, FRIDAY_ROLES } from "@/lib/friday-constants";

type Lead = typeof leads.$inferSelect;
export type FridayEmailKind = "confirmation" | "reminder" | "reminder_1h" | "reminder_10m" | "rollforward" | "followup" | "nudge" | "welcome";

export const CHEAT_SHEET_URL = "https://mannalendingco.com/send-it-cheat-sheet.pdf";
export { FRIDAY_CONSENT_TEXT, FRIDAY_ROLES };

const TEMPLATE_KEY: Record<FridayEmailKind, string> = {
  confirmation: "friday_confirmation",
  reminder: "friday_morning_reminder",
  reminder_1h: "friday_reminder_1h",
  reminder_10m: "friday_reminder_10m",
  rollforward: "friday_rollforward",
  followup: "friday_followup",
  nudge: "friday_nudge",
  welcome: "friday_partner_welcome",
};

// ---- who sends, who is already a partner ----------------------------------------

async function sender() {
  const lo = await db.query.users.findFirst({
    where: and(eq(users.baseRole, "loan_officer"), eq(users.active, true)),
    orderBy: (u, { asc }) => asc(u.createdAt),
  });
  const person = lo ?? (await db.query.users.findFirst({ where: and(eq(users.isAdmin, true), eq(users.active, true)), orderBy: (u, { asc }) => asc(u.createdAt) }));
  return person?.email ? { id: person.id, email: person.email } : null;
}

async function isSignedPartner(email: string): Promise<boolean> {
  const partner = await db.query.referralAffiliates.findFirst({
    where: eq(referralAffiliates.email, email.trim().toLowerCase()),
    columns: { status: true },
  });
  return partner?.status === "active" || partner?.status === "paused";
}

const button = (label: string, url: string) => `<span style="display:inline-block; margin:0 8px 8px 0;">${htmlButton(label, url)}</span>`;
const buttonRow = (buttons: [string, string][]) => `<div style="margin:12px 0 4px;">${buttons.map(([l, u]) => button(l, u)).join("")}</div>`;

/** The personal Zoom link, or the Friday page when Zoom isn't connected yet. */
function joinUrlFor(lead: Pick<Lead, "zoomJoinUrl">): string {
  return lead.zoomJoinUrl ?? process.env.ZOOM_JOIN_URL ?? `${appUrl()}/friday`;
}

// ---- sending ------------------------------------------------------------------------

/**
 * Sends one sequence email, at most once per (person, kind, session): the
 * send is claimed in friday_sends first, and released again if it fails so
 * the next run retries. Returns whether an email actually went out.
 */
export async function sendFridayEmail(
  lead: Lead,
  kind: FridayEmailKind,
  sessionKey: string,
  opts: { sessionDay?: string } = {}
): Promise<boolean> {
  const [claim] = await db.insert(fridaySends).values({ leadId: lead.id, kind, sessionKey }).onConflictDoNothing().returning({ id: fridaySends.id });
  if (!claim) return false;

  const release = () => db.delete(fridaySends).where(eq(fridaySends.id, claim.id)).catch(() => undefined);
  try {
    const template = await db.query.emailTemplates.findFirst({ where: eq(emailTemplates.key, TEMPLATE_KEY[kind]) });
    const from = await sender();
    if (!template || !template.active || !from) {
      await release();
      return false;
    }

    const day = opts.sessionDay ?? lead.fridayBookedSessionDate ?? nextSessionDay(new Date());
    const joinUrl = joinUrlFor(lead);
    const firstName = lead.name.trim().split(/\s+/)[0] || "there";
    // Button tokens on their own lines become real buttons; a run of them on
    // consecutive lines sits side by side in one row.
    const setupLink = template.body.includes("{{partnerSignupButton}}") ? await issuePartnerSetupLink(lead.email, lead.name) : null;
    const buttonDefs: Record<string, [string, string]> = {
      joinButton: ["Join the Zoom", joinUrl],
      calendarButton: ["Add to Google Calendar", googleCalendarUrl(day, joinUrl)],
      cheatSheetButton: ["Get the Send-It Cheat Sheet", CHEAT_SHEET_URL],
      partnerPortalButton: ["Open your partner portal", `${appUrl()}/partner`],
      partnerSignupButton: ["Set up your partner account", setupLink?.url ?? `${appUrl()}/become-a-partner`],
    };
    const blocks: Record<string, string> = {};
    let rows = 0;
    let run: string[] = [];
    const lines: string[] = [];
    const flush = () => {
      if (!run.length) return;
      const key = `buttonRow${rows++}`;
      blocks[key] = buttonRow(run.map((t) => buttonDefs[t]));
      lines.push(`{{${key}}}`);
      run = [];
    };
    for (const line of template.body.split("\n")) {
      const match = line.trim().match(/^\{\{(\w+Button)\}\}$/);
      if (match && buttonDefs[match[1]]) run.push(match[1]);
      else {
        flush();
        lines.push(line);
      }
    }
    flush();
    const bodyText = lines.join("\n");

    const tokens = { firstName, sessionDate: formatSession(day) };
    const subject = renderTemplate(template.subject, tokens);
    const html = plainTextToHtmlWithBlocks(renderTemplate(bodyText, tokens), blocks);

    const [logoHtml, signatureHtml] = await Promise.all([getCompanyLogoHtml(), getUserEmailSignatureHtml(from.id)]);
    await sendGmailAs(from.id, from.email, {
      to: lead.email,
      replyTo: from.email,
      subject,
      body: logoHtml + html + signatureHtml + leadMarketingEmailFooter(lead.id),
      html: true,
      category: "friday_zoom",
      attachments:
        kind === "confirmation"
          ? [{ fileName: "See It Send It Get Paid.ics", mimeType: "text/calendar", data: Buffer.from(buildIcs({ uid: lead.id, day, joinUrl })).toString("base64") }]
          : undefined,
    });
    return true;
  } catch (err) {
    console.error(`Friday ${kind} email failed:`, err);
    await release();
    return false;
  }
}

// ---- registration ---------------------------------------------------------------------

export interface FridayRegistration {
  name: string;
  email: string;
  phone: string;
  role: string;
  ip: string | null;
}

export async function registerFridayLead(input: FridayRegistration): Promise<{ leadId: string; sessionDay: string }> {
  const now = new Date();
  const sessionDay = nextSessionDay(now);
  const email = input.email.trim().toLowerCase();
  const phone = toE164(input.phone);
  const [firstName, ...rest] = input.name.trim().split(/\s+/);

  // Zoom first: if it can't register them there's no seat to confirm.
  // A Zoom hiccup never loses a signup: the seat is saved, you get an alert with
  // Zoom's actual message, and the scheduled job keeps retrying the registration.
  let zoom: { registrantId: string; joinUrl: string } | null = null;
  let zoomError: string | null = null;
  if (isZoomConfigured()) {
    try {
      zoom = await registerForMeeting({ email, firstName, lastName: rest.join(" "), phone });
    } catch (err) {
      zoomError = err instanceof Error ? err.message : "Unknown Zoom error";
      console.error("Zoom registration failed:", err);
    }
  }

  // Same email is the same person. Failing that, the same phone number is: and then
  // the email they just typed is the one to use, since that's where they're reading mail.
  const existing =
    (await db.query.leads.findFirst({ where: eq(leads.email, email) })) ?? (await db.query.leads.findFirst({ where: eq(leads.phone, phone) }));
  const booking = {
    role: input.role,
    monthlyList: true,
    fridayEmailOnly: false,
    fridayNoShowCount: 0,
    fridayBookedSessionDate: sessionDay,
    fridayStatus: "registered",
    zoomRegistrantId: zoom?.registrantId ?? existing?.zoomRegistrantId ?? null,
    zoomJoinUrl: zoom?.joinUrl ?? existing?.zoomJoinUrl ?? null,
    marketingConsent: true,
    consentText: FRIDAY_CONSENT_TEXT,
    consentIp: input.ip,
    consentAt: now,
    // Fresh consent supersedes an old opt-out, same as the other lead forms.
    unsubscribedAt: null,
    lastActivityAt: now,
  };

  let lead: Lead;
  if (existing) {
    [lead] = await db.update(leads).set({ name: input.name.trim(), email, ...booking }).where(eq(leads.id, existing.id)).returning();
    await db.insert(leadActivities).values({ leadId: lead.id, type: "form_submitted", metadata: { source: "friday_zoom", repeat: true } });
  } else {
    [lead] = await db.insert(leads).values({ name: input.name.trim(), email, phone, source: "friday_zoom", ...booking }).returning();
    await db.insert(leadActivities).values({ leadId: lead.id, type: "form_submitted", metadata: { source: "friday_zoom" } });
  }

  await createNotifications(await activeAdminIds(), {
    type: "friday_signup",
    title: `${lead.name} registered for Friday`,
    body: `${input.role} · ${formatSession(sessionDay)}`,
    href: "/pipeline/leads/friday",
  });
  if (zoomError) {
    await createNotifications(await activeAdminIds(), {
      type: "friday_zoom_error",
      title: `Zoom couldn't register ${lead.name}`,
      body: `Their seat is saved and I'll keep retrying. Zoom said: ${zoomError.slice(0, 300)}`,
      href: "/pipeline/leads/friday",
    });
  } else {
    await sendFridayEmail(lead, "confirmation", sessionDay, { sessionDay });
  }
  return { leadId: lead.id, sessionDay };
}

/** The welcome email for someone who came through the Friday page and just finished partner setup. */
export async function sendFridayWelcomeIfRegistered(email: string): Promise<void> {
  try {
    const lead = await db.query.leads.findFirst({
      where: and(eq(leads.email, email.trim().toLowerCase()), isNotNull(leads.fridayBookedSessionDate)),
    });
    if (lead && !lead.unsubscribedAt) await sendFridayEmail(lead, "welcome", "once");
  } catch (err) {
    console.error("Friday welcome email failed:", err);
  }
}

// ---- attendance ------------------------------------------------------------------------

type Registrant = Pick<Lead, "id" | "email" | "name" | "fridayNoShowCount">;

async function registrantsFor(day: string): Promise<Registrant[]> {
  return db
    .select({ id: leads.id, email: leads.email, name: leads.name, fridayNoShowCount: leads.fridayNoShowCount })
    .from(leads)
    .where(and(eq(leads.fridayBookedSessionDate, day), eq(leads.fridayStatus, "registered")));
}

/** Records who attended and who didn't for one session. */
export async function applyAttendance(day: string, attended: Set<string>): Promise<{ present: number; absent: number }> {
  const registrants = await registrantsFor(day);
  const { present, absent } = splitByAttendance(registrants, attended);
  const now = new Date();
  for (const r of present) {
    await db
      .update(leads)
      .set({ fridayStatus: "attended", fridayAttendedDate: day, fridayAttendedAt: now, fridayNoShowCount: afterAttended().noShowCount, fridayEmailOnly: afterAttended().emailOnly })
      .where(eq(leads.id, r.id));
  }
  for (const r of absent) {
    const next = afterNoShow({ noShowCount: r.fridayNoShowCount });
    await db.update(leads).set({ fridayStatus: "no_show", fridayNoShowCount: next.noShowCount, fridayEmailOnly: next.emailOnly }).where(eq(leads.id, r.id));
  }
  await db
    .insert(fridaySessions)
    .values({ sessionDate: day, syncedAt: now, registeredCount: registrants.length, attendedCount: present.length })
    .onConflictDoUpdate({ target: fridaySessions.sessionDate, set: { syncedAt: now, registeredCount: registrants.length, attendedCount: present.length } });
  return { present: present.length, absent: absent.length };
}

/** Admin override for one person; keeps the no-show count straight whichever way it flips. */
export async function setAttendance(leadId: string, status: "attended" | "no_show"): Promise<void> {
  const lead = await db.query.leads.findFirst({ where: eq(leads.id, leadId) });
  if (!lead || lead.fridayStatus === status) return;
  const day = lead.fridayAttendedDate && lead.fridayStatus === "attended" ? lead.fridayAttendedDate : lead.fridayBookedSessionDate;
  if (status === "attended") {
    const state = lead.fridayStatus === "no_show" ? undoNoShow({ noShowCount: lead.fridayNoShowCount }) : afterAttended();
    await db
      .update(leads)
      .set({ fridayStatus: "attended", fridayAttendedDate: day, fridayAttendedAt: new Date(), fridayNoShowCount: lead.fridayStatus === "no_show" ? state.noShowCount : 0, fridayEmailOnly: state.emailOnly })
      .where(eq(leads.id, leadId));
  } else {
    const next = afterNoShow({ noShowCount: lead.fridayNoShowCount });
    await db.update(leads).set({ fridayStatus: "no_show", fridayNoShowCount: next.noShowCount, fridayEmailOnly: next.emailOnly }).where(eq(leads.id, leadId));
  }
}

// ---- the scheduled job ------------------------------------------------------------------

export interface FridayJobResult {
  headcount: boolean;
  reminders: number;
  attendanceSynced: boolean;
  followups: number;
  nudges: number;
  rollForwards: number;
}

/** Contacts the sequence is allowed to email: opted in, not email-only, and not already a signed partner. */
async function sequenceEligible(lead: Lead): Promise<boolean> {
  return !lead.unsubscribedAt && !lead.fridayEmailOnly && !(await isSignedPartner(lead.email));
}

export async function runFridayJobs(now: Date = new Date()): Promise<FridayJobResult> {
  const result: FridayJobResult = { headcount: false, reminders: 0, attendanceSynced: false, followups: 0, nudges: 0, rollForwards: 0 };
  const today = etDay(now);
  const isFridayToday = etParts(now).weekday === 5;

  // Retry anyone Zoom couldn't register at signup, then send their confirmation.
  if (isZoomConfigured()) {
    const waiting = await db.query.leads.findMany({
      where: and(isNotNull(leads.fridayBookedSessionDate), gte(leads.fridayBookedSessionDate, today), eq(leads.fridayStatus, "registered"), sql`${leads.zoomJoinUrl} is null`),
    });
    for (const lead of waiting) {
      try {
        const [firstName, ...rest] = lead.name.trim().split(/\s+/);
        const zoom = await registerForMeeting({ email: lead.email, firstName, lastName: rest.join(" "), phone: lead.phone });
        const [updated] = await db.update(leads).set({ zoomRegistrantId: zoom.registrantId, zoomJoinUrl: zoom.joinUrl }).where(eq(leads.id, lead.id)).returning();
        await sendFridayEmail(updated, "confirmation", updated.fridayBookedSessionDate ?? today, { sessionDay: updated.fridayBookedSessionDate ?? today });
      } catch (err) {
        console.error("Zoom retry failed:", err);
      }
    }
  }

  // 8 AM Friday: who to expect.
  if (isFridayToday && isAtOrAfterEt(now, today, HEADCOUNT_HOUR_ET) && !isAtOrAfterEt(now, today, 12)) {
    const [session] = await db.insert(fridaySessions).values({ sessionDate: today }).onConflictDoNothing().returning();
    const row = session ?? (await db.query.fridaySessions.findFirst({ where: eq(fridaySessions.sessionDate, today) }));
    if (row && !row.headcountSentAt) {
      const people = await db.select({ name: leads.name, role: leads.role }).from(leads).where(and(eq(leads.fridayBookedSessionDate, today), eq(leads.fridayStatus, "registered")));
      await db.update(fridaySessions).set({ headcountSentAt: now }).where(eq(fridaySessions.sessionDate, today));
      if (people.length > 0) {
        await notifyAdmins({
          type: "friday_headcount",
          title: `${people.length} registered for today's Friday Zoom`,
          body: people.map((p) => `${p.name}${p.role ? ` (${p.role})` : ""}`).join(", "),
          href: "/pipeline/leads/friday",
        });
        result.headcount = true;
      }
    }
  }

  // Friday reminders: 9 AM "we're live at noon", 11:00 "live in 1 hour", 11:50 "starting in 10 minutes".
  // Each goes out once per person and stops at noon.
  if (isFridayToday && !isAtOrAfterEt(now, today, 12)) {
    const due: FridayEmailKind[] = [];
    if (isAtOrAfterEt(now, today, MORNING_REMINDER_HOUR_ET)) due.push("reminder");
    if (isAtOrAfterEtTime(now, today, HOUR_BEFORE_REMINDER_ET)) due.push("reminder_1h");
    if (isAtOrAfterEtTime(now, today, FINAL_REMINDER_ET)) due.push("reminder_10m");
    if (due.length > 0) {
      const registrants = await db.query.leads.findMany({ where: and(eq(leads.fridayBookedSessionDate, today), eq(leads.fridayStatus, "registered")) });
      for (const lead of registrants) {
        if (!(await sequenceEligible(lead))) continue;
        // Someone who signed up after an earlier reminder's time only gets the latest one that's due, not a pile of catch-up emails.
        const kind = due[due.length - 1];
        if (await sendFridayEmail(lead, kind, today, { sessionDay: today })) result.reminders++;
      }
    }
  }

  // After the session: pull attendance from Zoom, once.
  const finished = latestSessionDayBefore(now, 45);
  if (finished && isZoomConfigured()) {
    const done = await db.query.fridaySessions.findFirst({ where: eq(fridaySessions.sessionDate, finished) });
    if (!done?.syncedAt) {
      const registered = await registrantsFor(finished);
      if (registered.length > 0) {
        const attended = await attendedEmails(finished).catch((err) => {
          console.error("Zoom attendance lookup failed:", err);
          return null;
        });
        if (attended) {
          await applyAttendance(finished, attended);
          result.attendanceSynced = true;
        }
      }
    }
  }

  // 3 PM Friday: the next-step email for people who attended and haven't signed up.
  const attendedLeads = await db.query.leads.findMany({
    where: and(eq(leads.fridayStatus, "attended"), gte(leads.fridayAttendedDate, addDays(today, -3))),
  });
  for (const lead of attendedLeads) {
    const day = lead.fridayAttendedDate;
    if (day && isAtOrAfterEt(now, day, FOLLOWUP_HOUR_ET) && (await sequenceEligible(lead))) {
      if (await sendFridayEmail(lead, "followup", day, { sessionDay: day })) result.followups++;
    }
  }

  // Three days later, one nudge for anyone still not a partner.
  const followups = await db.query.fridaySends.findMany({
    where: and(eq(fridaySends.kind, "followup"), lte(fridaySends.sentAt, new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)), gte(fridaySends.sentAt, new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000))),
  });
  for (const f of followups) {
    const lead = await db.query.leads.findFirst({ where: eq(leads.id, f.leadId) });
    if (lead && (await sequenceEligible(lead)) && (await sendFridayEmail(lead, "nudge", f.sessionKey))) result.nudges++;
  }

  // Saturday 9 AM: rebook anyone who missed it (until two misses).
  const missed = await db.query.leads.findMany({
    where: and(eq(leads.fridayStatus, "no_show"), eq(leads.fridayEmailOnly, false), lt(leads.fridayBookedSessionDate, today)),
  });
  for (const lead of missed) {
    const booked = lead.fridayBookedSessionDate;
    if (!booked || !isAtOrAfterEt(now, addDays(booked, 1), ROLL_FORWARD_HOUR_ET)) continue;
    if (lead.unsubscribedAt || (await isSignedPartner(lead.email))) continue;
    const next = nextSessionDay(now);
    await db.update(leads).set({ fridayBookedSessionDate: next, fridayStatus: "registered" }).where(eq(leads.id, lead.id));
    if (await sendFridayEmail({ ...lead, fridayBookedSessionDate: next, fridayStatus: "registered" }, "rollforward", next, { sessionDay: next })) result.rollForwards++;
  }

  return result;
}

// ---- the admin screen -------------------------------------------------------------------

export async function getFridayAdminData(now: Date = new Date()) {
  const next = nextSessionDay(now);
  const last = latestSessionDayBefore(now, 0, 7) ?? addDays(next, -7);
  const people = (day: string) =>
    db
      .select({
        id: leads.id,
        name: leads.name,
        email: leads.email,
        phone: leads.phone,
        role: leads.role,
        status: leads.fridayStatus,
        noShows: leads.fridayNoShowCount,
        emailOnly: leads.fridayEmailOnly,
        unsubscribed: leads.unsubscribedAt,
      })
      .from(leads)
      .where(or(eq(leads.fridayBookedSessionDate, day), eq(leads.fridayAttendedDate, day)));
  const [upcoming, previous, monthly, lastSession] = await Promise.all([
    people(next),
    people(last),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(leads)
      .where(and(eq(leads.monthlyList, true), sql`${leads.unsubscribedAt} is null`)),
    db.query.fridaySessions.findFirst({ where: eq(fridaySessions.sessionDate, last) }),
  ]);
  return { next, last, upcoming, previous, monthlyCount: monthly[0]?.n ?? 0, lastSynced: Boolean(lastSession?.syncedAt), zoomConnected: isZoomConfigured() };
}

/** Admin test: registers an email for the meeting and reports Zoom's exact answer. Creates a real Zoom registrant if it works. */
export async function testZoomRegistration(email: string): Promise<{ ok: true; joinUrl: string } | { ok: false; error: string }> {
  try {
    const { joinUrl } = await registerForMeeting({ email, firstName: "Test", lastName: "Registration", phone: "" });
    return { ok: true, joinUrl };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown Zoom error" };
  }
}

export async function monthlyListEmails(): Promise<string[]> {
  const rows = await db.select({ email: leads.email }).from(leads).where(and(eq(leads.monthlyList, true), sql`${leads.unsubscribedAt} is null`));
  return rows.map((r) => r.email);
}


