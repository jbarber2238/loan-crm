// Shared shape for every hand-built "custom_form" client need — a purpose-
// built, richly-typed form matching a specific lender's own application
// questions (see schema.ts's clientNeedTemplateTypeEnum comment on
// "custom_form" for why this is separate from the plain-text "questionnaire"
// type). One definition file per lender/loan-type combination
// (cv3-dscr-purchase.ts, etc.), registered in registry.ts.

export type CustomFormFieldType =
  | "text"
  | "email"
  | "tel"
  | "number"
  | "currency"
  | "date"
  | "select"
  | "yesno"
  | "textarea";

export interface CustomFormField {
  name: string;
  label: string;
  type: CustomFormFieldType;
  options?: readonly { value: string; label: string }[];
  optional?: boolean;
  // Only rendered when the named field currently equals this value —
  // covers the form's "if yes, explain" follow-ups and the mailing-address
  // block that only appears when it differs from the primary address.
  showIf?: { field: string; equals: string };
  // This field reads its default from, and writes back to, a real column
  // on `deals` shared with other surfaces (the Roles tab, the existing
  // Title/Insurance Contact client needs) — see
  // src/server/actions/borrower-upload.ts's submitCustomFormAnswers and
  // src/app/borrower-upload/[token]/form/[needId]/page.tsx.
  syncDealField?: string;
  helpText?: string;
}

export interface CustomFormSection {
  title: string;
  fields: CustomFormField[];
}

export interface CustomFormDefinition {
  key: string;
  label: string;
  sections: CustomFormSection[];
}
