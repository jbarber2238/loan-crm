import { ATTENDED_MIN_SECONDS, etDay } from "@/lib/friday-schedule";

// Zoom's Server-to-Server OAuth app: registers each Friday signup for the
// recurring meeting (so Zoom gives them a personal join link and knows their
// email) and later reads who actually attended.
//
// Needs ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET and ZOOM_MEETING_ID
// (the recurring Friday meeting). Without them the Friday page still works —
// it just can't create personal links or read attendance.

const API = "https://api.zoom.us/v2";

export function isZoomConfigured(): boolean {
  return Boolean(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET && process.env.ZOOM_MEETING_ID);
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const basic = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(process.env.ZOOM_ACCOUNT_ID ?? "")}`,
    { method: "POST", headers: { Authorization: `Basic ${basic}` }, cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Zoom sign-in failed (${res.status}). Check the Zoom app credentials.`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function zoom<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Zoom ${path} failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return (res.status === 204 ? {} : await res.json()) as T;
}

/** Registers someone for the Friday meeting; returns their personal join link. Registering the same email again returns the same link. */
export async function registerForMeeting(person: {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
}): Promise<{ registrantId: string; joinUrl: string }> {
  const meetingId = process.env.ZOOM_MEETING_ID;
  const result = await zoom<{ registrant_id: string; join_url: string }>(`/meetings/${meetingId}/registrants`, {
    method: "POST",
    body: JSON.stringify({
      email: person.email,
      first_name: person.firstName,
      last_name: person.lastName || "-",
      phone: person.phone,
      auto_approve: true,
    }),
  });
  return { registrantId: result.registrant_id, joinUrl: result.join_url };
}

// Zoom wants a meeting UUID that starts with "/" or contains "//" encoded twice.
const encodeUuid = (uuid: string) => (uuid.startsWith("/") || uuid.includes("//") ? encodeURIComponent(encodeURIComponent(uuid)) : encodeURIComponent(uuid));

/**
 * The emails of everyone who stayed long enough on `sessionDay`, or null when
 * Zoom has no record of that meeting happening yet (not finished, or never held).
 */
export async function attendedEmails(sessionDay: string): Promise<Set<string> | null> {
  const meetingId = process.env.ZOOM_MEETING_ID;
  const instances = await zoom<{ meetings?: { uuid: string; start_time: string }[] }>(`/past_meetings/${meetingId}/instances`).catch(
    () => ({ meetings: [] as { uuid: string; start_time: string }[] })
  );
  const instance = (instances.meetings ?? []).find((m) => etDay(new Date(m.start_time)) === sessionDay);
  if (!instance) return null;

  const seconds = new Map<string, number>();
  let nextToken = "";
  do {
    const page = await zoom<{
      participants?: { user_email?: string; duration?: number }[];
      next_page_token?: string;
    }>(`/report/meetings/${encodeUuid(instance.uuid)}/participants?page_size=300${nextToken ? `&next_page_token=${encodeURIComponent(nextToken)}` : ""}`);
    for (const p of page.participants ?? []) {
      const email = p.user_email?.trim().toLowerCase();
      if (email) seconds.set(email, (seconds.get(email) ?? 0) + (p.duration ?? 0));
    }
    nextToken = page.next_page_token ?? "";
  } while (nextToken);

  return new Set([...seconds].filter(([, s]) => s >= ATTENDED_MIN_SECONDS).map(([email]) => email));
}

