export const PARTNER_TYPES = [
  { value: "agent", label: "Real estate agent" },
  { value: "property_manager", label: "Property manager" },
  { value: "cpa", label: "CPA / accountant" },
  { value: "lender", label: "Lender" },
  { value: "investor", label: "Investor" },
  { value: "other", label: "Other" },
] as const;

// The "Form - W9" template in the PandaDoc account.
export const W9_TEMPLATE_UUID = "3zDCercPHYop8So5W3kCCV";

export const MIN_PASSWORD_LENGTH = 10;
export const INVITE_LINK_DAYS = 14;
export const LOGIN_LINK_MINUTES = 15;
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;

/** ABA routing number checksum (3-7-1 weights). */
export function isValidRoutingNumber(value: string): boolean {
  if (!/^\d{9}$/.test(value)) return false;
  const d = value.split("").map(Number);
  const sum = 3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8]);
  return sum % 10 === 0;
}
