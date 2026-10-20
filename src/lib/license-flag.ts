import { stateFromAddress, stateName } from "@/lib/us-states";

export interface LicensedBroker {
  name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

export interface LicenseFlag {
  stateCode: string;
  stateName: string;
  broker: LicensedBroker | null;
}

/** The flag for a property, or null when its state isn't one that requires a license to close. */
export function licenseFlagFor(address: string, requiredStates: ReadonlySet<string>, broker: LicensedBroker | null): LicenseFlag | null {
  const code = stateFromAddress(address);
  if (!code || !requiredStates.has(code)) return null;
  const hasBroker = broker && (broker.name || broker.company);
  return { stateCode: code, stateName: stateName(code), broker: hasBroker ? broker : null };
}

/** "Jeremy Altervain · Vault · 310-890-4896", with whatever parts exist. */
export function describeBroker(broker: LicensedBroker | null): string {
  if (!broker) return "no licensed broker set up yet (Settings → Licensing)";
  const parts = [broker.name, broker.company, broker.phone, broker.email].filter((p): p is string => Boolean(p && p.trim()));
  return parts.length ? parts.join(" · ") : "no licensed broker set up yet (Settings → Licensing)";
}
