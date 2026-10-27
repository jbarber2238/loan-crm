// The connector never reads SSNs, bank/account numbers, dates of birth or file
// contents: none of those columns are ever selected (see data.ts). Free text a
// person typed (notes, need descriptions, email subjects) could still contain
// one by accident, so every free-text field passes through here before it
// leaves. Over-redacting (a 10-digit phone number, a ZIP+4) is the safe side.

const REDACTED = "[redacted]";

const PATTERNS: RegExp[] = [
  // Date of birth written next to a label ("DOB 4/12/1984", "born 1984-04-12").
  /\b(?:dob|d\.o\.b\.?|date\s+of\s+birth|birth\s?date|born(?:\s+on)?)\b[^\n\d]{0,12}(?:\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}|\d{4}-\d{2}-\d{2})/gi,
  // SSN / ITIN with or without dashes or spaces.
  /\b\d{3}[- ]\d{2}[- ]\d{4}\b/g,
  // Card / account numbers written in groups ("1234 5678 9012 3456").
  /\b(?:\d{4}[ -]){2,4}\d{1,4}\b/g,
  // Any unbroken run of 8-17 digits: account, routing, card and 9-digit SSNs.
  /\b\d{8,17}\b/g,
];

export function scrubSensitive(text: string): string {
  let out = text;
  for (const pattern of PATTERNS) out = out.replace(pattern, REDACTED);
  return out;
}

/** Free text bound for a tool result: scrubbed, flattened to one line, and capped. */
export function safeText(text: string | null | undefined, max = 300): string | null {
  if (text === null || text === undefined) return null;
  const flat = scrubSensitive(text).replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
