// Reads a domain's email-authentication records (SPF, DKIM, DMARC) and says in plain English what's wrong. Pure.
// Mail providers use these to decide whether an email really came from the domain it claims, and they lean on
// them hard when someone sends marketing mail: broken records mean spam folders and blocked sending.

export type AuthStatus = "ok" | "warn" | "bad";

export interface AuthCheck {
  id: "spf" | "dkim" | "dmarc";
  label: string;
  status: AuthStatus;
  /** What was found, in plain English. */
  detail: string;
  /** What to do about it. Null when nothing's needed. */
  fix: string | null;
  /** A ready-to-paste record value when we can work one out. */
  suggested: string | null;
}

export interface AuthRecords {
  domain: string;
  /** Every TXT record at the domain itself. */
  txt: string[];
  /** Every TXT record at _dmarc.<domain>. */
  dmarc: string[];
  /** Every TXT record at google._domainkey.<domain>. */
  dkim: string[];
}

const isSpf = (r: string) => /^v=spf1(\s|$)/i.test(r.trim());

/** One SPF record that keeps everything the domain already allows and adds Google. */
export function mergeSpf(records: string[]): string {
  const terms = new Set<string>();
  let all = "~all";
  for (const r of records) {
    for (const t of r.trim().split(/\s+/).slice(1)) {
      if (/^[+\-~?]?all$/i.test(t)) {
        if (t.toLowerCase() === "-all" || all === "~all") all = t.toLowerCase() === "+all" ? "~all" : t.toLowerCase();
      } else terms.add(t);
    }
  }
  terms.add("include:_spf.google.com");
  return ["v=spf1", ...[...terms].sort((a, b) => (a === "include:_spf.google.com" ? -1 : b === "include:_spf.google.com" ? 1 : 0)), all].join(" ");
}

export function analyzeAuth(r: AuthRecords): AuthCheck[] {
  const spfRecords = r.txt.filter(isSpf);
  const checks: AuthCheck[] = [];

  if (spfRecords.length === 0) {
    checks.push({
      id: "spf",
      label: "SPF (who may send for your domain)",
      status: "bad",
      detail: `${r.domain} has no SPF record.`,
      fix: "Add one TXT record on the domain's DNS with the value below.",
      suggested: "v=spf1 include:_spf.google.com ~all",
    });
  } else if (spfRecords.length > 1) {
    checks.push({
      id: "spf",
      label: "SPF (who may send for your domain)",
      status: "bad",
      detail: `${r.domain} has ${spfRecords.length} separate SPF records. Mail servers treat that as an error and ignore all of them, so your email can't be verified.`,
      fix: "Delete all the SPF records and add back a single one that combines them, with the value below. (Remove any service you no longer use.)",
      suggested: mergeSpf(spfRecords),
    });
  } else if (!/include:_spf\.google\.com/i.test(spfRecords[0])) {
    checks.push({
      id: "spf",
      label: "SPF (who may send for your domain)",
      status: "bad",
      detail: `The SPF record doesn't list Google, so mail sent from Gmail fails the check.`,
      fix: "Replace the SPF record with the value below, which keeps what's there and adds Google.",
      suggested: mergeSpf(spfRecords),
    });
  } else {
    checks.push({ id: "spf", label: "SPF (who may send for your domain)", status: "ok", detail: "One SPF record, and it includes Google.", fix: null, suggested: null });
  }

  const dkim = r.dkim.find((v) => /v=DKIM1/i.test(v) || /p=[A-Za-z0-9+/]/.test(v));
  checks.push(
    dkim
      ? { id: "dkim", label: "DKIM (your email's digital signature)", status: "ok", detail: "Google's signing key is published.", fix: null, suggested: null }
      : {
          id: "dkim",
          label: "DKIM (your email's digital signature)",
          status: "bad",
          detail: `No signing key was found for ${r.domain} (looked for the usual "google" key). Without it Gmail can't sign your mail as yours.`,
          fix: "In Google Admin: Apps, Google Workspace, Gmail, Authenticate email. Pick the domain, click Generate new record, add the TXT record it shows to your DNS, wait a few minutes, then click Start authentication.",
          suggested: null,
        }
  );

  const dmarc = r.dmarc.find((v) => /^v=DMARC1/i.test(v.trim()));
  if (!dmarc) {
    checks.push({
      id: "dmarc",
      label: "DMARC (what to do with mail that fails)",
      status: "bad",
      detail: "No DMARC record.",
      fix: "Add a TXT record at _dmarc with the value below.",
      suggested: "v=DMARC1; p=none; rua=mailto:justin@creativecashpartners.com",
    });
  } else {
    const policy = dmarc.match(/;\s*p=(\w+)/i)?.[1]?.toLowerCase() ?? "none";
    checks.push(
      policy === "none"
        ? {
            id: "dmarc",
            label: "DMARC (what to do with mail that fails)",
            status: "warn",
            detail: "A DMARC record exists but only watches (p=none). That's the right place to start.",
            fix: "Once SPF and DKIM above both pass for a couple of weeks, change p=none to p=quarantine.",
            suggested: null,
          }
        : { id: "dmarc", label: "DMARC (what to do with mail that fails)", status: "ok", detail: `DMARC is enforcing (p=${policy}).`, fix: null, suggested: null }
    );
  }
  return checks;
}
