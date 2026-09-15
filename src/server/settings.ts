import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { companySettings } from "@/server/db/schema";

export const DEFAULT_COMPANY_NAME = "[Your Company]";

export async function getCompanyName(): Promise<string> {
  const row = await db.query.companySettings.findFirst({
    where: eq(companySettings.id, "default"),
  });
  return row?.name ?? DEFAULT_COMPANY_NAME;
}

/** For the Settings → Company page — just enough to show a preview, not the actual image bytes. */
export async function getCompanyLogoFileName(): Promise<string | null> {
  const row = await db.query.companySettings.findFirst({
    where: eq(companySettings.id, "default"),
  });
  return row?.logoFileName ?? null;
}

/**
 * An <img> tag (wrapped in a dark backdrop when the logo itself is
 * light-colored, so it doesn't disappear against an email's white
 * background) pointing at the public /api/company-logo route, or an empty
 * string if nothing's been uploaded — prepended to every outgoing email
 * (pricing requests, borrower lifecycle) so branding is automatic rather
 * than something Justin has to paste into each template himself. The
 * updatedAt-based query param busts email-client image caches whenever the
 * logo changes.
 */
export async function getCompanyLogoHtml(): Promise<string> {
  const row = await db.query.companySettings.findFirst({
    where: eq(companySettings.id, "default"),
  });
  if (!row?.logoData) return "";
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const src = `${baseUrl}/api/company-logo?v=${row.updatedAt.getTime()}`;
  const img = `<img src="${src}" alt="" style="max-height:56px; display:block;" />`;
  if (!row.logoIsLight) return `<div style="margin-bottom:16px;">${img}</div>`;
  return `<div style="display:inline-block; background:#111318; border-radius:6px; padding:10px 14px; margin-bottom:16px;">${img}</div>`;
}

/**
 * Same /api/company-logo path used in emails, but just the src plus whether
 * the logo itself is light-colored — for rendering in the app UI (the
 * sidebar header, the settings preview), where each caller already knows
 * its own background and can decide whether a contrasting backdrop is
 * needed. Null if nothing's been uploaded.
 */
export async function getCompanyLogo(): Promise<{ src: string; isLight: boolean } | null> {
  const row = await db.query.companySettings.findFirst({
    where: eq(companySettings.id, "default"),
  });
  if (!row?.logoData) return null;
  return { src: `/api/company-logo?v=${row.updatedAt.getTime()}`, isLight: row.logoIsLight };
}

export async function getPandaDocApiKey(): Promise<string | null> {
  const row = await db.query.companySettings.findFirst({
    where: eq(companySettings.id, "default"),
  });
  return row?.pandadocApiKey ?? null;
}

export async function getPandaDocWebhookSharedKey(): Promise<string | null> {
  const row = await db.query.companySettings.findFirst({
    where: eq(companySettings.id, "default"),
  });
  return row?.pandadocWebhookSharedKey ?? null;
}

export async function getStripeSecretKey(): Promise<string | null> {
  const row = await db.query.companySettings.findFirst({
    where: eq(companySettings.id, "default"),
  });
  return row?.stripeSecretKey ?? null;
}

export async function getStripeWebhookSecret(): Promise<string | null> {
  const row = await db.query.companySettings.findFirst({
    where: eq(companySettings.id, "default"),
  });
  return row?.stripeWebhookSecret ?? null;
}
