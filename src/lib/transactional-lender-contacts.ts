export interface LenderContact {
  name: string;
  phone: string | null;
  email: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Reads the additional-contacts JSON the lender form submits; every contact needs an email. */
export function parseAdditionalContacts(raw: string | null | undefined): LenderContact[] {
  if (!raw?.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Couldn't read the additional contacts — try again.");
  }
  if (!Array.isArray(parsed)) throw new Error("Couldn't read the additional contacts — try again.");

  const contacts: LenderContact[] = [];
  for (const item of parsed) {
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    const phone = typeof item?.phone === "string" && item.phone.trim() ? item.phone.trim() : null;
    const email = typeof item?.email === "string" ? item.email.trim() : "";
    // A completely blank row (added and never filled in) is just dropped.
    if (!name && !phone && !email) continue;
    if (!EMAIL_PATTERN.test(email)) {
      throw new Error(`Each additional contact needs a valid email${name ? ` (check ${name})` : ""}.`);
    }
    contacts.push({ name, phone, email });
  }
  return contacts;
}

/** Everyone an email to this lender goes to: the main contact first, then the additional ones, no duplicates. */
export function lenderEmailRecipients(mainEmail: string | null, additional: LenderContact[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const email of [mainEmail, ...additional.map((c) => c.email)]) {
    const trimmed = email?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}
