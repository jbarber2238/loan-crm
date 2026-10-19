// The rules for what attendance does to a registrant. Two no-shows in a row
// ends the rebooking (they stay on the monthly list, nothing else); showing up
// clears the count.

export const MAX_NO_SHOWS = 2;

export interface AttendanceState {
  noShowCount: number;
  emailOnly: boolean;
}

export function afterAttended(): AttendanceState {
  return { noShowCount: 0, emailOnly: false };
}

export function afterNoShow(current: Pick<AttendanceState, "noShowCount">): AttendanceState {
  const noShowCount = current.noShowCount + 1;
  return { noShowCount, emailOnly: noShowCount >= MAX_NO_SHOWS };
}

/** Undoing a no-show that was marked by mistake (an admin override to "attended"). */
export function undoNoShow(current: Pick<AttendanceState, "noShowCount">): AttendanceState {
  return { noShowCount: 0, emailOnly: false, ...(current.noShowCount > 1 ? { noShowCount: current.noShowCount - 1, emailOnly: current.noShowCount - 1 >= MAX_NO_SHOWS } : {}) };
}

/** Splits a session's registrants by whether Zoom saw their email in the meeting. */
export function splitByAttendance<T extends { email: string }>(registrants: T[], attended: Set<string>) {
  const present: T[] = [];
  const absent: T[] = [];
  for (const r of registrants) (attended.has(r.email.trim().toLowerCase()) ? present : absent).push(r);
  return { present, absent };
}
