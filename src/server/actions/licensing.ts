"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { companySettings, licenseRequiredStates } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { fail } from "@/lib/action-result";
import { US_STATES } from "@/lib/us-states";

function revalidateLicensing() {
  revalidatePath("/settings/licensing");
  revalidatePath("/pipeline");
}

const text = (formData: FormData, key: string): string | null => {
  const v = formData.get(key);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

/** Saves the company's own NMLS ID and the licensed broker to close deals under. */
export async function saveLicensingDetails(formData: FormData) {
  await requireAdmin();
  const email = text(formData, "brokerEmail");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("That email address doesn't look right.");
  const values = {
    nmlsId: text(formData, "nmlsId"),
    licensedBrokerName: text(formData, "brokerName"),
    licensedBrokerCompany: text(formData, "brokerCompany"),
    licensedBrokerPhone: text(formData, "brokerPhone"),
    licensedBrokerEmail: email,
    licensedBrokerNotes: text(formData, "brokerNotes"),
  };
  await db
    .insert(companySettings)
    .values({ id: "default", name: process.env.COMPANY_NAME ?? "Manna Lending", ...values })
    .onConflictDoUpdate({ target: companySettings.id, set: values });
  revalidateLicensing();
}

export async function addLicenseState(code: string) {
  await requireAdmin();
  const upper = code.trim().toUpperCase();
  if (!US_STATES.some((s) => s.code === upper)) return fail("Choose a state.");
  await db.insert(licenseRequiredStates).values({ stateCode: upper }).onConflictDoNothing();
  revalidateLicensing();
}

export async function removeLicenseState(code: string) {
  await requireAdmin();
  await db.delete(licenseRequiredStates).where(eq(licenseRequiredStates.stateCode, code.trim().toUpperCase()));
  revalidateLicensing();
}
