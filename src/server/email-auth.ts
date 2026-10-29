import { resolveTxt } from "node:dns/promises";
import { analyzeAuth, type AuthCheck } from "@/lib/email-auth";

async function txt(name: string): Promise<string[]> {
  try {
    const records = await Promise.race([resolveTxt(name), new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000))]);
    return records.map((parts) => parts.join(""));
  } catch {
    return [];
  }
}

/** Looks up the sending domain's live records and checks them. Returns null when there's no domain to check. */
export async function checkEmailAuth(senderEmail: string | null | undefined): Promise<{ domain: string; checks: AuthCheck[] } | null> {
  const domain = senderEmail?.split("@")[1]?.toLowerCase();
  if (!domain) return null;
  const [own, dmarc, dkim] = await Promise.all([txt(domain), txt(`_dmarc.${domain}`), txt(`google._domainkey.${domain}`)]);
  return { domain, checks: analyzeAuth({ domain, txt: own, dmarc, dkim }) };
}
