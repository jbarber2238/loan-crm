import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { companySettings } from "@/server/db/schema";
import { licenseFlagFor, type LicenseFlag, type LicensedBroker } from "@/lib/license-flag";

export interface LicensingConfig {
  states: string[]; // two-letter codes
  broker: LicensedBroker | null;
  nmlsId: string | null;
}

export async function getLicensingConfig(): Promise<LicensingConfig> {
  const [states, settings] = await Promise.all([
    db.query.licenseRequiredStates.findMany({ orderBy: (s, { asc }) => asc(s.stateCode) }),
    db.query.companySettings.findFirst({
      where: eq(companySettings.id, "default"),
      columns: {
        nmlsId: true,
        licensedBrokerName: true,
        licensedBrokerCompany: true,
        licensedBrokerPhone: true,
        licensedBrokerEmail: true,
        licensedBrokerNotes: true,
      },
    }),
  ]);
  const broker: LicensedBroker | null = settings
    ? {
        name: settings.licensedBrokerName,
        company: settings.licensedBrokerCompany,
        phone: settings.licensedBrokerPhone,
        email: settings.licensedBrokerEmail,
        notes: settings.licensedBrokerNotes,
      }
    : null;
  return { states: states.map((s) => s.stateCode), broker, nmlsId: settings?.nmlsId ?? null };
}

/** Flags for a batch of addresses at once (one trip to the database for the whole board). */
export async function licenseFlagsFor(addresses: string[]): Promise<(LicenseFlag | null)[]> {
  const config = await getLicensingConfig();
  const states = new Set(config.states);
  return addresses.map((a) => (states.size ? licenseFlagFor(a, states, config.broker) : null));
}

export async function licenseFlagForAddress(address: string): Promise<LicenseFlag | null> {
  return (await licenseFlagsFor([address]))[0];
}
