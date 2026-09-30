"use server";

import { desc } from "drizzle-orm";
import { db } from "@/server/db/client";
import { leadMagnetSubmissions } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Public, unauthenticated — this is the gate on a marketing-site lead
// magnet, submitted by a visitor who has never signed in and never will.
export async function submitLeadMagnet(source: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const consent = formData.get("consent") === "on";

  if (!name) throw new Error("Please enter your name.");
  if (!EMAIL_RE.test(email)) throw new Error("Please enter a valid email address.");
  if (phone.replace(/\D/g, "").length < 10) throw new Error("Please enter a valid phone number.");
  if (!consent) throw new Error("Please agree to receive marketing communications to continue.");

  await db.insert(leadMagnetSubmissions).values({ name, email, phone, marketingConsent: consent, source });
}

export interface LeadMagnetSubmission {
  id: string;
  name: string;
  email: string;
  phone: string;
  marketingConsent: boolean;
  source: string;
  createdAt: Date;
}

export async function getLeadMagnetSubmissions(): Promise<LeadMagnetSubmission[]> {
  await requireAdmin();
  return db.query.leadMagnetSubmissions.findMany({
    orderBy: desc(leadMagnetSubmissions.createdAt),
  });
}
