// How long an invite stays alive and when reminders go out. Pure, so the rules are testable.

export const DEFAULT_REMINDER_DAYS = [2, 5, 9, 14];
export const DEFAULT_EXPIRES_DAYS = 21;

/** "2, 5, 9, 14" -> [2, 5, 9, 14]. Ignores junk, duplicates and anything under 1 day, and sorts. */
export function parseReminderDays(raw: string | null | undefined): number[] {
  const days = (raw ?? "")
    .split(/[,\s]+/)
    .map((p) => Number(p))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 365);
  return [...new Set(days)].sort((a, b) => a - b);
}

export function formatReminderDays(days: number[]): string {
  return days.join(", ");
}

export interface InviteSteps {
  /** The step to send now (1-based), or null. When several are overdue only the latest goes out. */
  due: number | null;
  /** Earlier overdue steps that are skipped rather than sent late in a pile. */
  skipped: number[];
}

/**
 * Which reminder is due for an invite `ageDays` old, given the schedule and the
 * steps already handled. Nothing is due once the invite has expired.
 */
export function nextDueStep(ageDays: number, days: number[], handled: ReadonlySet<number>, expiresDays: number): InviteSteps {
  if (ageDays >= expiresDays) return { due: null, skipped: [] };
  const overdue = days.map((d, i) => ({ step: i + 1, d })).filter(({ step, d }) => d <= ageDays && !handled.has(step));
  if (overdue.length === 0) return { due: null, skipped: [] };
  const last = overdue[overdue.length - 1];
  return { due: last.step, skipped: overdue.slice(0, -1).map((o) => o.step) };
}

/** Which of the editable templates a step uses: the last step is always the "final" one. */
export function reminderTemplateKey(step: number, totalSteps: number): string {
  if (step === totalSteps) return "partner_invite_reminder_final";
  if (step === 1) return "partner_invite_reminder_first";
  if (step === 2) return "partner_invite_reminder_second";
  return "partner_invite_reminder_third";
}

export function isInviteExpired(ageDays: number, expiresDays: number): boolean {
  return ageDays >= expiresDays;
}
