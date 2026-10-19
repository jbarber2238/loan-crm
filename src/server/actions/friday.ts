"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { leads } from "@/server/db/schema";
import { requireAdminOrLoanOfficer } from "@/server/auth/guards";
import { fail } from "@/lib/action-result";
import { FRIDAY_ROLES } from "@/lib/friday-constants";
import { applyAttendance, monthlyListEmails, registerFridayLead, runFridayJobs, setAttendance, testZoomRegistration } from "@/server/friday";
import { attendedEmails, checkZoomConnection, isZoomConfigured } from "@/server/zoom";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function clientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return forwarded ? forwarded.split(",")[0]!.trim() : h.get("x-real-ip");
}

/** Public: saves a seat for the next Friday Zoom, then shows the confirmation screen. */
export async function registerForFriday(formData: FormData) {
  // Honeypot: a person never sees this field.
  if (String(formData.get("website") ?? "").trim()) redirect("/friday");

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const role = String(formData.get("role") ?? "");
  if (!name) return fail("Please enter your name.");
  if (!EMAIL_RE.test(email)) return fail("Please enter a valid email address.");
  if (phone.replace(/\D/g, "").length < 10) return fail("Please enter a valid phone number.");
  if (!(FRIDAY_ROLES as readonly string[]).includes(role)) return fail("Please choose what best describes you.");

  const ip = await clientIp();
  if (ip) {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(leads)
      .where(and(eq(leads.consentIp, ip), gte(leads.consentAt, since)));
    if (n >= 6) return fail("Too many sign-ups from this connection. Please try again in a little while.");
  }
  let leadId: string;
  try {
    ({ leadId } = await registerFridayLead({ name, email, phone, role, ip }));
  } catch (err) {
    console.error("Friday registration failed:", err);
    return fail("We couldn't save your seat just now. Please try again in a minute.");
  }
  redirect(`/friday?seat=${leadId}`);
}

// ---- admin ---------------------------------------------------------------------------------

export async function markFridayAttendance(leadId: string, status: "attended" | "no_show") {
  await requireAdminOrLoanOfficer();
  await setAttendance(leadId, status);
  revalidatePath("/pipeline/leads/friday");
}

/** Pulls attendance for the most recent session from Zoom right now, instead of waiting for the scheduled run. */
export async function syncFridayAttendanceNow(day: string) {
  await requireAdminOrLoanOfficer();
  if (!isZoomConfigured()) return fail("Zoom isn't connected yet.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return fail("Pick a valid session.");
  const attended = await attendedEmails(day).catch(() => null);
  if (!attended) return fail("Zoom doesn't have a report for that session yet. Try again in a few minutes.");
  const counts = await applyAttendance(day, attended);
  revalidatePath("/pipeline/leads/friday");
  return { present: counts.present, absent: counts.absent };
}

export async function copyMonthlyList(): Promise<string[]> {
  await requireAdminOrLoanOfficer();
  return monthlyListEmails();
}

/** Runs the scheduled job on demand (testing). */
export async function runFridayJobsNow() {
  await requireAdminOrLoanOfficer();
  const result = await runFridayJobs();
  revalidatePath("/pipeline/leads/friday");
  return result;
}

/** Read-only check that the Zoom connection is set up properly. */
export async function checkZoom() {
  await requireAdminOrLoanOfficer();
  return checkZoomConnection();
}

export async function testZoomRegistrationAction(email: string) {
  await requireAdminOrLoanOfficer();
  if (!EMAIL_RE.test(email.trim())) return fail("Enter a valid email address.");
  return testZoomRegistration(email.trim().toLowerCase());
}
