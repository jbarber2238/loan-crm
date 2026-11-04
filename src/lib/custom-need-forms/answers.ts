import type { CustomFormDefinition } from "./types";

// A draft is saved as the borrower types, so it only needs to be bounded, not valid: no required-field check, and a
// ceiling on each answer so the saved blob can't grow without limit.
export const MAX_DRAFT_ANSWER_CHARS = 5000;

/** Every field the form defines, trimmed, with blanks left out. Anything the form doesn't define is ignored. */
export function collectCustomFormAnswers(
  definition: CustomFormDefinition,
  getValue: (fieldName: string) => FormDataEntryValue | null,
  maxChars = Infinity
): Record<string, string> {
  const answers: Record<string, string> = {};
  for (const section of definition.sections) {
    for (const field of section.fields) {
      const value = getValue(field.name);
      const trimmed = typeof value === "string" ? value.trim().slice(0, maxChars) : "";
      if (trimmed) answers[field.name] = trimmed;
    }
  }
  return answers;
}
