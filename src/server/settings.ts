import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { companySettings } from "@/server/db/schema";
import { derivePortalTheme, normalizeHex } from "@/lib/brand-colors";

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
  // An email client can only load a public address — never localhost, which is
  // what an unset APP_URL (e.g. a test email sent from a dev machine) would give.
  const configured = process.env.APP_URL;
  const baseUrl = configured && !/localhost|127\.0\.0\.1/.test(configured) ? configured : "https://mannalendingco.com";
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

export interface TwilioSettings {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
}

export async function getTwilioSettings(): Promise<TwilioSettings | null> {
  const row = await db.query.companySettings.findFirst({
    where: eq(companySettings.id, "default"),
  });
  if (!row?.twilioAccountSid || !row.twilioAuthToken || !row.twilioPhoneNumber) return null;
  return { accountSid: row.twilioAccountSid, authToken: row.twilioAuthToken, phoneNumber: row.twilioPhoneNumber };
}

/** The org-wide TCPA-safe ceiling for outbound calls/texts — "HH:MM" 24h strings, or null if never configured. */
export async function getTcpaOutboundWindow(): Promise<{ start: string; end: string } | null> {
  const row = await db.query.companySettings.findFirst({
    where: eq(companySettings.id, "default"),
  });
  if (!row?.tcpaOutboundStart || !row.tcpaOutboundEnd) return null;
  return { start: row.tcpaOutboundStart, end: row.tcpaOutboundEnd };
}

/** Name and upload date of the company wire instructions file, or null when none is uploaded. */
export async function getCompanyWireInstructions(): Promise<{ fileName: string; updatedAt: Date | null } | null> {
  const row = await db.query.companySettings.findFirst({
    where: eq(companySettings.id, "default"),
    columns: { wireInstructionsFileName: true, wireInstructionsUpdatedAt: true },
  });
  return row?.wireInstructionsFileName ? { fileName: row.wireInstructionsFileName, updatedAt: row.wireInstructionsUpdatedAt } : null;
}

export type PortalBranding = {
  headerColor: string | null;
  /** The progress color (progress bar and stage bar). */
  accentColor: string | null;
  buttonColor: string | null;
  palette: { hex: string; name: string | null; usage: string | null }[];
};

/** The borrower upload link's chosen colors. Both null means the standard look. */
export async function getPortalBranding(): Promise<PortalBranding> {
  const row = await db.query.companySettings.findFirst({
    where: eq(companySettings.id, "default"),
    columns: { portalHeaderColor: true, portalAccentColor: true, portalButtonColor: true, portalBrandPalette: true },
  });
  const header = normalizeHex(row?.portalHeaderColor);
  const accent = normalizeHex(row?.portalAccentColor);
  const both = header && accent;
  return {
    headerColor: both ? header : null,
    accentColor: both ? accent : null,
    buttonColor: both ? (normalizeHex(row?.portalButtonColor) ?? accent) : null,
    palette: row?.portalBrandPalette ?? [],
  };
}

/** What the public borrower pages need: the derived theme (or null for the standard look) and the logo. */
export async function getPortalLook() {
  const [branding, logo, name] = await Promise.all([getPortalBranding(), getCompanyLogo(), getCompanyName()]);
  const theme =
    branding.headerColor && branding.accentColor ? derivePortalTheme(branding.headerColor, branding.accentColor, branding.buttonColor) : null;
  return { theme, logo, companyName: name };
}
