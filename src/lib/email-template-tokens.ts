/**
 * Single source of truth for which {{merge fields}} an email template can
 * reference, per category — used both to show the "available fields" hint
 * in the editor and to tell the AI drafter what it's allowed to use.
 *
 * ALL_DEAL_TOKENS below must exactly match the keys buildAllDealTokens()
 * (src/server/deal-tokens.ts) returns — every discrete field on the deal,
 * the staff/lender it's linked to, and its insurance/title contacts. Every
 * category spreads this in, so a field available in one email is available
 * in all of them; only genuinely computed/category-specific fields (a
 * pricing note, the origination-fee paragraph, term-sheet summaries) are
 * listed separately below.
 */

export interface EmailTemplateToken {
  key: string;
  description: string;
}

/** Matches buildContactTemplateTokens() (src/server/contact-tokens.ts) exactly. */
export const CONTACT_TOKENS: EmailTemplateToken[] = [
  { key: "insuranceAgency", description: "Insurance agency name" },
  { key: "insuranceAgentName", description: "Insurance agent's full name" },
  { key: "insuranceAgentEmail", description: "Insurance agent's email" },
  { key: "insuranceAgentPhone", description: "Insurance agent's phone number" },
  { key: "titleCompanyAgentName", description: "Title company / agent name" },
  { key: "titleAgentEmail", description: "Title agent's email" },
  { key: "titleAgentPhone", description: "Title agent's phone number" },
];

/**
 * Every discrete field on the deal — matches buildAllDealTokens()
 * (src/server/deal-tokens.ts) exactly, including the contact fields it
 * folds in. Available in every template category.
 */
export const ALL_DEAL_TOKENS: EmailTemplateToken[] = [
  // Borrower
  { key: "borrowerName", description: "Borrower's full name" },
  { key: "borrowerFirstName", description: "Borrower's first name (for a personal greeting)" },
  { key: "borrowerLastName", description: "Borrower's last name" },
  { key: "entityName", description: "Borrower's entity/LLC name" },
  { key: "borrowerOrEntity", description: "Borrower's entity/LLC name, or their own name if none" },
  { key: "borrowerPhone", description: "Borrower's phone number" },
  { key: "borrowerEmail", description: "Borrower's email address" },
  { key: "maritalStatus", description: "Borrower's marital status" },
  { key: "citizenship", description: "Borrower's citizenship status" },
  { key: "fico", description: "Borrower's estimated FICO" },
  { key: "numFlips", description: "Number of flips in the last 36 months" },
  { key: "numRentals", description: "Number of rentals in the last 36 months" },
  { key: "numNewConstruction", description: "Number of new-construction projects in the last 36 months" },
  { key: "experience", description: "Borrower's flips/rentals/new-construction experience, pre-formatted" },
  { key: "liquidity", description: "Borrower's available liquidity" },
  { key: "mortgageLatesLast12mo", description: "Mortgage lates in the last 12 months (Yes/No)" },
  { key: "taxLiensBkForeclosureLast24mo", description: "Tax liens/bankruptcy/foreclosure in the last 24 months (Yes/No)" },

  // Property
  { key: "propertyAddress", description: "Subject property address" },
  { key: "parcelId", description: "Assessor's Parcel Number (new construction with no address yet)" },
  { key: "propertyTypeLabel", description: "Property type (Single Family, Duplex, etc.)" },
  { key: "unitCount", description: "Unit count when finished" },
  { key: "exitStrategyLabel", description: "Exit strategy (sell, hold, etc.)" },
  { key: "ownsLand", description: "Whether the borrower already owns the property/land (Yes/No)" },
  { key: "purchaseDate", description: "Property purchase date, full format (N/A if not yet purchased)" },
  { key: "purchaseDateShort", description: "Property purchase date, MM/YY" },
  { key: "occupancyLabel", description: "Current occupancy status" },
  { key: "rentalStrategyLabel", description: "Rental strategy (long-term, short-term, etc.)" },
  { key: "rural", description: "Whether the property is rural (Yes/No)" },
  { key: "propertyListedOnMarket", description: "Whether the property is currently listed for sale (Yes/No)" },

  // Financial
  { key: "purchasePrice", description: "Purchase price" },
  { key: "rehabBudget", description: "Total rehab/construction budget" },
  { key: "rehabDone", description: "Description of rehab already done" },
  { key: "arv", description: "Expected after-repair/finished value" },
  { key: "asIsValue", description: "Estimated as-is value" },
  { key: "asIsLotValue", description: "Estimated as-is lot value (new construction)" },
  { key: "currentBalanceOwed", description: "Current mortgage payoff amount" },
  { key: "currentMonthlyMortgagePayment", description: "Current monthly mortgage payment" },
  { key: "monthlyRent", description: "Current/expected monthly rent" },
  { key: "annualTaxes", description: "Annual property taxes" },
  { key: "annualInsurance", description: "Annual insurance" },
  { key: "annualHoa", description: "Annual HOA (N/A if none)" },
  { key: "capitalPartner", description: "Whether there's a capital partner on the deal (Yes/No)" },

  // Loan
  { key: "loanNumber", description: "This loan's unique loan number, e.g. 1000" },
  { key: "loanPurposeLabel", description: "Loan category label, e.g. \"DSCR Purchase\"" },
  { key: "dscrOrBridge", description: "\"DSCR\" or \"Bridge\" depending on loan category" },
  { key: "transactionType", description: "\"Purchase\" or \"Refinance\", based on the loan category" },
  { key: "loanAmountRequested", description: "Requested loan amount" },
  { key: "finalRate", description: "Final/accepted interest rate" },
  { key: "finalTerms", description: "Final terms notes" },
  { key: "finalAmortizationType", description: "Final amortization type, e.g. \"30 Year Fixed\", \"5/6 ARM\"" },
  { key: "finalLoanTermYears", description: "Final loan term in years" },
  { key: "finalLoanTermMonths", description: "Final loan term in months (fix-and-flip, new construction, bridge)" },
  { key: "approvedLoanAmount", description: "Approved loan amount (post-acceptance)" },
  { key: "loanAmount", description: "Approved loan amount, or the requested amount if not yet approved" },
  { key: "approvedLtv", description: "Approved/negotiated LTV" },
  { key: "appraisedValue", description: "Appraised value" },
  { key: "costToBorrowerFee", description: "Lender points / rate buydown fee" },
  { key: "processingFeeOverride", description: "Our processing fee (or \"$999 (standard)\" if not overridden)" },
  { key: "originationPointsLabel", description: "Origination points as a percentage, e.g. \"2%\"" },
  { key: "rateLocked", description: "Whether the rate is locked (Yes/No)" },
  { key: "rateLockedAt", description: "Date the rate was locked" },
  { key: "creditPullDate", description: "Date credit was pulled" },
  { key: "closingDate", description: "Estimated closing date, or \"TBD\" if none on file" },
  { key: "closingDateLine", description: "\"Anticipated Closing: ...\" line, or blank if no date on file" },
  { key: "stageLabel", description: "Current pipeline stage" },
  { key: "source", description: "Lead source" },

  // Staff / lender
  { key: "assignedLoanOfficerName", description: "The assigned loan officer's name" },
  { key: "assignedLoanOfficerEmail", description: "The assigned loan officer's email" },
  { key: "assignedProcessorName", description: "The assigned processor's name" },
  { key: "assignedProcessorEmail", description: "The assigned processor's email" },
  { key: "assignedAssistantName", description: "The assigned loan officer assistant's name" },
  { key: "assignedAssistantEmail", description: "The assigned loan officer assistant's email" },
  { key: "lenderName", description: "The lender assigned to this deal" },

  ...CONTACT_TOKENS,
];

export const PRICING_REQUEST_TOKENS: EmailTemplateToken[] = [
  ...ALL_DEAL_TOKENS,
  { key: "repName", description: "Lender rep's first name" },
  { key: "senderName", description: "Your (the sending user's) name" },
  { key: "companyName", description: "Company name from Settings" },
  { key: "notesLine", description: "Your pricing note to the rep, pre-formatted (blank if none)" },
  { key: "propertyType", description: "Property type — same as propertyTypeLabel, kept for older templates" },
  { key: "ltvOnAsIsValue", description: "Loan amount and LTV% against as-is value" },
  { key: "purchasePriceOrAsIs", description: "Purchase price, or as-is value if no purchase" },
  { key: "ltvOnPurchaseOrAsIs", description: "Loan amount and LTV% against purchase price/as-is value" },
  { key: "purchaseOrRefinanceFlip", description: "\"Purchase\" or \"Refinance (delayed purchase)\"" },
  { key: "purchaseOrRefinanceConstruction", description: "\"Purchase\" or \"Refinance (already own land)\"" },
];

export const BORROWER_LIFECYCLE_TOKENS: EmailTemplateToken[] = [
  ...ALL_DEAL_TOKENS,
  { key: "senderName", description: "Your (the sending user's) name" },
  { key: "companyName", description: "Company name from Settings" },
  { key: "termSheetLinks", description: "Link(s) to the term sheet PDF(s) being sent, one per line" },
  { key: "schedulingLink", description: "The assigned loan officer's scheduling link" },
  { key: "loanAmountRange", description: "Loan amount across the term sheets being sent — a range if they differ (HML/Construction)" },
  { key: "ltvRange", description: "LTV% across the term sheets being sent — a range if they differ (DSCR)" },
  { key: "loanTermRange", description: "Loan term (years) across the term sheets being sent — a range if they differ" },
  { key: "loanTypeOptions", description: "Distinct loan/amortization types across the term sheets being sent, e.g. \"30-Year Fixed, 5/6 ARM\"" },
  { key: "prepaymentPenaltyOptions", description: "Distinct prepayment penalty terms across the term sheets being sent (DSCR)" },
  { key: "clientNeedsStatusList", description: "Pre-formatted status list: rejected documents (with the processor's note) first, then still-outstanding client needs below" },
  { key: "clientNeedsUploadButton", description: "A ready-to-click HTML button linking to the borrower's upload page" },
  { key: "clientNeedsUploadUrl", description: "The borrower's raw upload link, if you'd rather write your own link/wording" },
  { key: "processingFeeInvoiceAmount", description: "The dollar amount actually invoiced (e.g. \"$999\")" },
  { key: "processingFeeInvoiceUrl", description: "Raw link to Stripe's hosted payment page for this invoice, if you'd rather write your own link/wording" },
  { key: "processingFeeInvoiceButton", description: "A ready-to-click \"Pay this invoice\" HTML button linking to the Stripe payment page" },
];

const KEY_DATE_ORDER_EXTRAS: EmailTemplateToken[] = [
  { key: "senderName", description: "Your (the sending user's) name" },
  { key: "senderEmail", description: "Your (the sending user's) email" },
  { key: "companyName", description: "Company name from Settings" },
];

export const INSURANCE_REQUEST_TOKENS: EmailTemplateToken[] = [
  { key: "contactFirstName", description: "Insurance agent's first name" },
  ...ALL_DEAL_TOKENS,
  ...KEY_DATE_ORDER_EXTRAS,
];

export const TITLE_REQUEST_TOKENS: EmailTemplateToken[] = [
  { key: "contactFirstName", description: "Title agent's first name" },
  ...ALL_DEAL_TOKENS,
  ...KEY_DATE_ORDER_EXTRAS,
];

export const APPLICATION_SUBMISSION_TOKENS: EmailTemplateToken[] = [
  ...ALL_DEAL_TOKENS,
  { key: "repName", description: "Lender rep's first name" },
  { key: "senderName", description: "Your (the sending user's) name" },
  { key: "companyName", description: "Company name from Settings" },
  {
    key: "termsParagraph",
    description:
      "Always computed fresh from the deal's own numbers — the quoted rate, buydown, and origination fee, never hand-typed",
  },
];

/** For a processor's own personal "introducing myself" email/text (My Profile → Send Intro Email/Text) — not one of the shared admin template categories below, since each processor writes their own rather than sharing one from the company-wide Email Templates table. */
export const PROCESSOR_INTRO_TOKENS: EmailTemplateToken[] = [
  ...ALL_DEAL_TOKENS,
  { key: "senderName", description: "Your (the sending user's) name" },
  { key: "companyName", description: "Company name from Settings" },
];

export type EmailTemplateCategory =
  | "pricing_request"
  | "borrower_lifecycle"
  | "insurance_request"
  | "title_request"
  | "application_submission";

export function tokensForCategory(category: EmailTemplateCategory): EmailTemplateToken[] {
  switch (category) {
    case "pricing_request":
      return PRICING_REQUEST_TOKENS;
    case "insurance_request":
      return INSURANCE_REQUEST_TOKENS;
    case "title_request":
      return TITLE_REQUEST_TOKENS;
    case "application_submission":
      return APPLICATION_SUBMISSION_TOKENS;
    case "borrower_lifecycle":
    default:
      return BORROWER_LIFECYCLE_TOKENS;
  }
}
