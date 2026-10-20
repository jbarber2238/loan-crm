export const US_STATES: { code: string; name: string }[] = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" }, { code: "AZ", name: "Arizona" }, { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" }, { code: "CO", name: "Colorado" }, { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" }, { code: "FL", name: "Florida" }, { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" }, { code: "IN", name: "Indiana" }, { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" }, { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" }, { code: "MA", name: "Massachusetts" }, { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" }, { code: "MT", name: "Montana" }, { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" }, { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" }, { code: "NC", name: "North Carolina" }, { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" }, { code: "PA", name: "Pennsylvania" }, { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" }, { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" }, { code: "VT", name: "Vermont" }, { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" }, { code: "WY", name: "Wyoming" },
];

const CODES = new Set(US_STATES.map((s) => s.code));
const BY_NAME = new Map(US_STATES.map((s) => [s.name.toLowerCase(), s.code]));

export function stateName(code: string): string {
  return US_STATES.find((s) => s.code === code)?.name ?? code;
}

/**
 * The two-letter state at the end of a property address, however it was typed:
 * "Detroit, MI 48201", "Saint Joseph, Mi. 49085", "Austin TX", or the full name
 * ("..., Texas 78701"). Null when there's no recognizable state.
 */
export function stateFromAddress(address: string): string | null {
  const text = address.trim().replace(/\s+/g, " ");
  // "..., ST 12345" or "..., ST 12345-6789" (case and a trailing period don't matter)
  const withZip = text.match(/(?:^|[\s,])([A-Za-z]{2})\.?,?\s+\d{5}(?:-\d{4})?\s*$/);
  if (withZip && CODES.has(withZip[1].toUpperCase())) return withZip[1].toUpperCase();
  // "..., Texas 78701" / "..., Texas"
  const named = text.match(/,\s*([A-Za-z ]+?)\.?(?:\s+\d{5}(?:-\d{4})?)?\s*$/);
  if (named) {
    const byName = BY_NAME.get(named[1].trim().toLowerCase());
    if (byName) return byName;
  }
  // "..., ST" with nothing after
  const bare = text.match(/,\s*([A-Za-z]{2})\.?\s*$/);
  if (bare && CODES.has(bare[1].toUpperCase())) return bare[1].toUpperCase();
  return null;
}
