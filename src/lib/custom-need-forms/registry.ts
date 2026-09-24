import type { CustomFormDefinition } from "./types";
import { CV3_DSCR_PURCHASE } from "./cv3-dscr-purchase";

export const CUSTOM_NEED_FORM_REGISTRY: Record<string, CustomFormDefinition> = {
  [CV3_DSCR_PURCHASE.key]: CV3_DSCR_PURCHASE,
};

export const CUSTOM_NEED_FORM_OPTIONS = Object.values(CUSTOM_NEED_FORM_REGISTRY).map((f) => ({
  value: f.key,
  label: f.label,
}));

export function getCustomFormDefinition(key: string | null | undefined): CustomFormDefinition | null {
  if (!key) return null;
  return CUSTOM_NEED_FORM_REGISTRY[key] ?? null;
}

// Every field across every registered form that syncs with a shared deal
// column — used both to seed defaults (read) and to write borrower answers
// back (write) in submitCustomFormAnswers.
export function syncedFieldsFor(definition: CustomFormDefinition): { name: string; dealField: string }[] {
  return definition.sections
    .flatMap((s) => s.fields)
    .filter((f): f is typeof f & { syncDealField: string } => Boolean(f.syncDealField))
    .map((f) => ({ name: f.name, dealField: f.syncDealField }));
}
