// One entry per category ever passed to sendGmailAs — kept as a plain
// object (not a DB enum) since a new email type should never require a
// migration, just a new key here. "Auto" categories are exactly the ones
// treated as automated in the Email Log's manual/automatic split.
export const EMAIL_LOG_CATEGORY_LABELS: Record<string, string> = {
  client_needs_update: "Client needs update",
  client_needs_reminder_auto: "Client needs reminder (automatic)",
  borrower_intro: "Borrower intro",
  application_submission: "Application submission",
  key_date_order: "Insurance/title order",
  pricing_request: "Pricing request",
  term_sheet: "Term sheet",
  book_a_call: "Book a call",
  processing_fee_invoice: "Processing fee invoice",
  borrower_activity_digest: "Borrower activity confirmation",
  staff_activity_digest: "Staff activity notification",
  borrower_submission_received: "Submission received",
  borrower_rate_shopping: "Rate shopping update",
  borrower_accepted_terms: "Accepted terms notification",
  processor_ready: "Processor ready-to-work notification",
  admin_new_deal: "New deal notification",
  referral_affiliate: "Referral affiliate",
  staff_invite: "Staff invite",
  other: "Other",
};

export function emailLogCategoryLabel(category: string): string {
  return EMAIL_LOG_CATEGORY_LABELS[category] ?? category;
}

// Everything else is a one-off, deliberate send from a person; these are
// the ones that fire on their own, with no click behind them.
export const AUTOMATIC_EMAIL_CATEGORIES = new Set([
  "client_needs_reminder_auto",
  "borrower_activity_digest",
  "staff_activity_digest",
  "borrower_submission_received",
  "borrower_rate_shopping",
  "borrower_accepted_terms",
  "processor_ready",
  "admin_new_deal",
]);
