// What the Marketing Email page lists: every automated email sequence, who gets it, and when it goes out.
// Pure (no database), so the wording and rules are testable. The page fills in live on/off state, saved
// send times and send counts around this.

import { CLOSING_SURVEY_DAYS, CLOSING_SURVEY_TEMPLATE_KEYS } from "@/lib/closing-survey";
import { FRIDAY_SCHEDULE_KEYS, formatClock, type FridayTimes } from "@/lib/friday-schedule";
import { reminderTemplateKey } from "@/lib/partner-invite-cadence";

/** How a person changes when an email goes out. "none" means it's fixed (shown, but not editable here). */
export type TimingControl =
  | { type: "clock"; key: string } // a time of day, Eastern
  | { type: "delay"; key: string } // days after the previous email
  | { type: "partner_days" } // the group's reminder days
  | { type: "none" };

export interface CatalogEmail {
  templateKey: string;
  title: string;
  /** Plain English: when this goes out, given the current settings. */
  when: string;
  /** Who it goes to, and who is skipped. */
  audience: string;
  timing: TimingControl;
  /** Whether the On/Off switch really stops this email. Where it doesn't, no switch is shown. */
  canToggle: boolean;
}

export interface CatalogGroup {
  id: "friday" | "partner" | "survey";
  title: string;
  summary: string;
  /** Where the sent counts come from (an email_log_entries category), when this group logs there. */
  logCategory: string | null;
  emails: CatalogEmail[];
}

export interface PartnerSchedule {
  reminderDays: number[];
  expiresDays: number;
}

const FRIDAY_AUDIENCE = "People who registered for the Friday Zoom and agreed to emails. Anyone unsubscribed, set to email-only or already a partner is skipped.";

export function buildCatalog(times: FridayTimes, partner: PartnerSchedule): CatalogGroup[] {
  const k = FRIDAY_SCHEDULE_KEYS;
  const friday: CatalogEmail[] = [
    {
      templateKey: "friday_confirmation",
      title: "Confirmation",
      when: "Right after they register, with their personal Zoom link and a calendar invite.",
      audience: "Each person who registers.",
      timing: { type: "none" },
      canToggle: true,
    },
    {
      templateKey: k.morningReminder,
      title: "Morning-of reminder",
      when: `Friday at ${formatClock(times.morningReminder)} ET, the day of the session.`,
      audience: FRIDAY_AUDIENCE,
      timing: { type: "clock", key: k.morningReminder },
      canToggle: true,
    },
    {
      templateKey: k.hourBefore,
      title: "1 hour before",
      when: `Friday at ${formatClock(times.hourBefore)} ET.`,
      audience: FRIDAY_AUDIENCE,
      timing: { type: "clock", key: k.hourBefore },
      canToggle: true,
    },
    {
      templateKey: k.tenMinutes,
      title: "10 minutes before",
      when: `Friday at ${formatClock(times.tenMinutes)} ET.`,
      audience: FRIDAY_AUDIENCE,
      timing: { type: "clock", key: k.tenMinutes },
      canToggle: true,
    },
    {
      templateKey: k.followUp,
      title: "Thanks for joining",
      when: `Friday at ${formatClock(times.followUp)} ET, after the session.`,
      audience: "People Zoom shows attended who aren't partners yet.",
      timing: { type: "clock", key: k.followUp },
      canToggle: true,
    },
    {
      templateKey: k.nudge,
      title: "Partner nudge",
      when: `${times.nudgeDelayDays} ${times.nudgeDelayDays === 1 ? "day" : "days"} after the thanks-for-joining email. Sent once.`,
      audience: "People who got the thanks-for-joining email and still aren't partners.",
      timing: { type: "delay", key: k.nudge },
      canToggle: true,
    },
    {
      templateKey: k.rollForward,
      title: "Rebook after a no-show",
      when: `Saturday at ${formatClock(times.rollForward)} ET, the morning after the session. Stops after two misses.`,
      audience: "People who registered but didn't join, who aren't partners.",
      timing: { type: "clock", key: k.rollForward },
      canToggle: true,
    },
    {
      templateKey: "friday_partner_welcome",
      title: "Welcome to the partner program",
      when: "The moment they set up their partner account.",
      audience: "People who came through the Friday Zoom and become partners.",
      timing: { type: "none" },
      canToggle: true,
    },
  ];

  const total = partner.reminderDays.length;
  const reminderStepKeys = ["partner_invite_reminder_first", "partner_invite_reminder_second", "partner_invite_reminder_third", "partner_invite_reminder_final"];
  const used = new Map<string, number>();
  partner.reminderDays.forEach((day, i) => used.set(reminderTemplateKey(i + 1, total), day));
  const partnerEmails: CatalogEmail[] = [
    {
      templateKey: "partner_invite_initial",
      title: "The invite",
      when: "When you invite someone from Settings → Referrals.",
      audience: "The person you invite.",
      timing: { type: "none" },
      canToggle: false,
    },
    ...reminderStepKeys.map((key, i): CatalogEmail => {
      const day = used.get(key);
      return {
        templateKey: key,
        title: key.endsWith("final") ? "Final reminder" : `Reminder ${i + 1}`,
        when:
          day === undefined
            ? "Not used: your schedule has fewer reminders."
            : `Day ${day} after the invite${key.endsWith("final") ? " (the last one before the link expires)" : ""}.`,
        audience: "Invited people who haven't set up their account yet. Nothing sends once the link has expired.",
        timing: { type: "partner_days" },
        canToggle: true,
      };
    }),
  ];

  const survey: CatalogEmail[] = CLOSING_SURVEY_TEMPLATE_KEYS.map((key, i) => ({
    templateKey: key,
    title: i === 0 ? "Thank-you and survey" : `Survey reminder ${i}`,
    when: i === 0 ? "The moment a deal is marked Closed." : `${CLOSING_SURVEY_DAYS[i]} days after closing, if they haven't answered.`,
    audience: "The borrower on a closed deal, from the deal's loan officer.",
    timing: { type: "none" },
    canToggle: false,
  }));

  return [
    {
      id: "friday",
      title: "Friday Zoom: See It, Send It, Get Paid",
      summary: "The weekly lunch Zoom for people who might refer deals. Sessions are Fridays at 12:00 PM ET.",
      logCategory: "friday_zoom",
      emails: friday,
    },
    {
      id: "partner",
      title: "Partner invites",
      summary: `The invite and the reminders that follow until someone sets up their partner account. The link expires after ${partner.expiresDays} days.`,
      logCategory: "referral_affiliate",
      emails: partnerEmails,
    },
    {
      id: "survey",
      title: "Closing survey",
      summary: "Sent to borrowers after a loan closes. The schedule is fixed. Results are under Client Reviews.",
      logCategory: null,
      emails: survey,
    },
  ];
}
