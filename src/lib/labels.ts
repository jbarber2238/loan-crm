export const STAGES = [
  { value: "new", label: "New" },
  { value: "rate_shopping", label: "Rate Shopping" },
  { value: "term_sheet", label: "Term Sheet" },
  { value: "negotiation", label: "Negotiation" },
  { value: "application", label: "Application" },
  { value: "processing", label: "Processing" },
  { value: "conditional_approval", label: "Conditional Approval" },
  { value: "clear_to_close", label: "Clear to Close" },
  { value: "closed", label: "Closed" },
  { value: "on_hold", label: "On Hold" },
  { value: "lost", label: "Lost" },
  { value: "follow_up", label: "Follow-up" },
  { value: "disqualified", label: "Disqualified" },
] as const;

export const LOAN_CATEGORIES = [
  { value: "dscr_purchase", label: "DSCR Purchase" },
  { value: "dscr_cash_out_refinance", label: "DSCR Cash-Out Refinance" },
  { value: "dscr_rate_term_refinance", label: "DSCR Rate & Term Refinance" },
  { value: "fix_and_flip", label: "Fix and Flip" },
  { value: "bridge_purchase", label: "Bridge – Purchase" },
  { value: "bridge_refinance", label: "Bridge – Refinance" },
  { value: "new_construction", label: "New Construction" },
  { value: "portfolio", label: "Portfolio" },
] as const;

// The two categories a fix-and-flip/new-construction deal can convert into
// via the DSCR refinance intake link (see src/server/actions/deal-conversion.ts)
// — a subset of LOAN_CATEGORIES, kept here rather than in that "use server"
// file since a server-actions file can only export async functions.
export const DSCR_REFI_TARGET_CATEGORIES = [
  { value: "dscr_cash_out_refinance", label: "DSCR Cash-Out Refinance" },
  { value: "dscr_rate_term_refinance", label: "DSCR Rate & Term Refinance" },
] as const;

export const BASE_ROLES = [
  { value: "loan_officer", label: "Loan Officer" },
  { value: "loan_officer_assistant", label: "Loan Officer Assistant" },
  { value: "processor", label: "Processor" },
] as const;

export const PROPERTY_TYPES = [
  { value: "single_family", label: "Single Family" },
  { value: "condo", label: "Condo" },
  { value: "townhome", label: "Townhome" },
  { value: "duplex", label: "Duplex" },
  { value: "triplex", label: "Triplex" },
  { value: "fourplex", label: "Fourplex" },
  { value: "multifamily_5plus", label: "5+ Unit Multifamily" },
  { value: "mixed_use", label: "Mixed-Use" },
] as const;

export const RESIDENTIAL_PROPERTY_TYPES = [
  "single_family",
  "condo",
  "townhome",
  "duplex",
  "triplex",
  "fourplex",
] as const;

export const EXIT_STRATEGIES = [
  { value: "refinance", label: "Refinance" },
  { value: "fix_and_sell", label: "Fix and Sell" },
  { value: "fix_and_hold", label: "Fix and Hold" },
  { value: "purchase_and_hold", label: "Purchase and Hold" },
  { value: "build_and_sell", label: "Build and Sell" },
] as const;

export const RENTAL_STRATEGIES = [
  { value: "long_term", label: "Long Term Rental" },
  { value: "mid_term", label: "Mid Term Rental" },
  { value: "short_term", label: "Short Term Rental" },
  { value: "coliving", label: "Coliving" },
] as const;

export const OCCUPANCY_STATUSES = [
  { value: "vacant", label: "Vacant" },
  { value: "tenant_occupied", label: "Tenant Occupied" },
] as const;

export const MARITAL_STATUSES = [
  { value: "married", label: "Married" },
  { value: "unmarried", label: "Unmarried" },
  { value: "separated", label: "Separated" },
] as const;

export const CITIZENSHIP_STATUSES = [
  { value: "us_citizen", label: "U.S. Citizen" },
  { value: "permanent_resident_alien", label: "Permanent Resident Alien" },
  { value: "non_permanent_resident_alien", label: "Non-Permanent Resident Alien" },
  { value: "foreign_national", label: "Foreign National" },
  { value: "itin", label: "ITIN" },
] as const;

export const CLIENT_NEED_TYPES = [
  { value: "document_upload", label: "Document Upload" },
  { value: "esign", label: "E-Sign Document" },
  { value: "questionnaire", label: "Questions" },
  { value: "link", label: "Link" },
  { value: "pandadoc_form", label: "PandaDoc Form" },
  { value: "custom_form", label: "Custom Form (Application)" },
] as const;

export const CLIENT_NEED_CATEGORIES = [
  { value: "applications", label: "Applications" },
  { value: "financials", label: "Financials" },
  { value: "borrower_experience", label: "Borrower Experience" },
  { value: "rehab_construction_budget", label: "Rehab / Construction Budget" },
  { value: "insurance", label: "Insurance" },
  { value: "entity_documents", label: "Entity Documents" },
  { value: "property_title", label: "Property & Title" },
  { value: "borrower_identification", label: "Borrower Identification" },
  { value: "authorizations_signatures", label: "Authorizations & Signatures" },
  { value: "other", label: "Other" },
] as const;

export function labelFor<T extends { value: string; label: string }>(
  list: readonly T[],
  value: string
): string {
  return list.find((item) => item.value === value)?.label ?? value;
}
