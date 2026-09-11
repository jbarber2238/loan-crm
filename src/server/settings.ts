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

export async function getDscrCalculatorLink(): Promise<string | null> {
  const row = await db.query.companySettings.findFirst({
    where: eq(companySettings.id, "default"),
  });
  return row?.dscrCalculatorLink ?? null;
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
