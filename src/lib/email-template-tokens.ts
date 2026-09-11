/**
 * Single source of truth for which {{merge fields}} an email template can
 * reference, per category — used both to show the "available fields" hint
 * in the editor and to tell the AI drafter what it's allowed to use.
 *
 * Keys here must exactly match the keys buildPricingTemplateTokens()
 * (src/server/pricing-templates.ts) / buildBorrowerTemplateTokens()
 * (src/server/borrower-templates.ts) actually return for each category.
 * Stage-triggered automated sending is still unwired — these tokens are also
 * the safe, generic vocabulary any future borrower email can be authored against.
 */

export interface EmailTemplateToken {
  key: string;
  description: string;
}

export const PRICING_REQUEST_TOKENS: EmailTemplateToken[] = [
  { key: "repName", description: "Lender rep's first name" },
  { key: "senderName", description: "Your (the sending user's) name" },
  { key: "companyName", description: "Company name from Settings" },
  { key: "notesLine", description: "Your pricing note to the rep, pre-formatted (blank if none)" },
  { key: "dscrOrBridge", description: "\"DSCR\" or \"Bridge\" depending on loan category" },
  { key: "entityName", description: "Borrower's entity/LLC name" },
  { key: "fico", description: "Borrower's estimated FICO" },
  { key: "citizenship", description: "Borrower's citizenship status" },
  { key: "experience", description: "Borrower's flips/rentals/new-construction experience" },
  { key: "propertyAddress", description: "Subject property address" },
  { key: "propertyType", description: "Property type (Single Family, Duplex, etc.)" },
  { key: "loanPurposeLabel", description: "Loan category label, e.g. \"DSCR Purchase\"" },
  { key: "asIsValue", description: "Estimated as-is value" },
  { key: "currentBalanceOwed", description: "Current mortgage payoff amount" },
  { key: "ltvOnAsIsValue", description: "Loan amount and LTV% against as-is value" },
  { key: "monthlyRent", description: "Current/expected monthly rent" },
  { key: "annualTaxes", description: "Annual property taxes" },
  { key: "annualInsurance", description: "Annual insurance" },
  { key: "annualHoa", description: "Annual HOA (or N/A)" },
  { key: "purchaseDate", description: "Property purchase date, full format" },
  { key: "purchaseDateShort", description: "Property purchase date, MM/YY" },
  { key: "rehabDone", description: "Description of rehab already done" },
  { key: "purchasePriceOrAsIs", description: "Purchase price, or as-is value if no purchase" },
  { key: "ltvOnPurchaseOrAsIs", description: "Loan amount and LTV% against purchase price/as-is value" },
  { key: "unitCount", description: "Unit count when finished" },
  { key: "exitStrategyLabel", description: "Exit strategy (sell, hold, etc.)" },
  { key: "purchaseOrRefinanceFlip", description: "\"Purchase\" or \"Refinance (delayed purchase)\"" },
  { key: "purchaseOrRefinanceConstruction", description: "\"Purchase\" or \"Refinance (already own land)\"" },
  { key: "purchasePrice", description: "Purchase price" },
  { key: "ownsLand", description: "Whether the borrower already owns the land (Yes/No)" },
  { key: "arv", description: "Expected after-repair/finished value" },
  { key: "rehabBudget", description: "Total rehab/construction budget" },
  { key: "liquidity", description: "Borrower's available liquidity" },
];

export const BORROWER_LIFECYCLE_TOKENS: EmailTemplateToken[] = [
  { key: "borrowerFirstName", description: "Borrower's first name (for a personal greeting)" },
  { key: "borrowerName", description: "Borrower's full name" },
  { key: "entityName", description: "Borrower's entity/LLC name" },
  { key: "propertyAddress", description: "Subject property address" },
  { key: "loanNumber", description: "This loan's unique loan number, e.g. 1000" },
  { key: "loanPurposeLabel", description: "Loan category label, e.g. \"DSCR Purchase\"" },
  { key: "loanAmountRequested", description: "Requested loan amount" },
  { key: "assignedLoanOfficerName", description: "The loan officer's name" },
  { key: "companyName", description: "Company name from Settings" },
  { key: "senderName", description: "Your (the sending user's) name" },
  { key: "termSheetLinks", description: "Link(s) to the term sheet PDF(s) being sent, one per line" },
  { key: "schedulingLink", description: "The assigned loan officer's scheduling link" },
  { key: "loanAmountRange", description: "Loan amount across the term sheets being sent — a range if they differ (HML/Construction)" },
  { key: "ltvRange", description: "LTV% across the term sheets being sent — a range if they differ (DSCR)" },
  { key: "loanTermRange", description: "Loan term (years) across the term sheets being sent — a range if they differ" },
  { key: "loanTypeOptions", description: "Distinct loan/amortization types across the term sheets being sent, e.g. \"30-Year Fixed, 5/6 ARM\"" },
  { key: "prepaymentPenaltyOptions", description: "Distinct prepayment penalty terms across the term sheets being sent (DSCR)" },
  { key: "dscrCalculatorLink", description: "DSCR calculator link from Company Settings" },
  { key: "clientNeedsStatusList", description: "Pre-formatted status list: rejected documents (with the processor's note) first, then still-outstanding client needs below" },
  { key: "clientNeedsUploadButton", description: "A ready-to-click HTML button linking to the borrower's upload page" },
  { key: "clientNeedsUploadUrl", description: "The borrower's raw upload link, if you'd rather write your own link/wording" },
];

export function tokensForCategory(category: "pricing_request" | "borrower_lifecycle"): EmailTemplateToken[] {
  return category === "pricing_request" ? PRICING_REQUEST_TOKENS : BORROWER_LIFECYCLE_TOKENS;
}
