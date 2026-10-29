import { checkEmailAuth } from "@/server/email-auth";

/** Short plain-English list of the email-authentication problems still to fix (empty when the sending domain is set up properly). */
export async function loadSetupIssues(senderEmail: string | null | undefined): Promise<string[]> {
  const auth = await checkEmailAuth(senderEmail);
  if (!auth) return [];
  const names: Record<string, string> = { spf: "SPF record", dkim: "DKIM signing key", dmarc: "DMARC record" };
  return auth.checks.filter((c) => c.status === "bad").map((c) => `${names[c.id]} on ${auth.domain}`);
}
