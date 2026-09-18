import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals, users, lenders } from "@/server/db/schema";
import {
  STAGES,
  LOAN_CATEGORIES,
  PROPERTY_TYPES,
  EXIT_STRATEGIES,
  RENTAL_STRATEGIES,
  OCCUPANCY_STATUSES,
  MARITAL_STATUSES,
  CITIZENSHIP_STATUSES,
  labelFor,
} from "@/lib/labels";
import { buildContactTemplateTokens } from "@/server/contact-tokens";

type Deal = typeof deals.$inferSelect;

function money(value: string | null): string {
  return value ? `$${Number(value).toLocaleString()}` : "Not provided";
}

function pct(value: string | null): string {
  return value ? `${Number(value)}%` : "Not provided";
}

function yesNo(value: boolean | null): string {
  if (value === true) return "Yes";
  if (value === false) return "No";
  return "Not provided";
}

function numOrNA(value: number | null): string {
  return value !== null && value !== undefined ? String(value) : "Not provided";
}

function textOr(value: string | null): string {
  return value ?? "Not provided";
}

function dateOrNA(date: Date | null, fallback: "Not provided" | "N/A" = "Not provided"): string {
  return date ? date.toLocaleDateString("en-US") : fallback;
}

function dateShort(date: Date | null): string {
  if (!date) return "N/A";
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getFullYear()).slice(2)}`;
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

function lastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] || fullName;
}

/**
 * Every discrete field on the deal (plus the staff/lender it's linked to),
 * as a flat {{token}} dictionary — the single source every email template
 * category draws from, so a field available in one email is available in
 * all of them. Category-specific builders (pricing-templates.ts,
 * borrower-templates.ts, vendor-templates.ts) spread this in first, then
 * layer their own computed/derived fields (notesLine, termsParagraph,
 * ltvOnAsIsValue, etc.) on top.
 *
 * Async because assigned staff and the lender are looked up by id here,
 * rather than requiring every call site to remember to load those relations
 * just to get a name into a merge field.
 */
export async function buildAllDealTokens(deal: Deal): Promise<Record<string, string>> {
  const [assignedLoanOfficer, assignedProcessor, assignedAssistant, lender] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, deal.assignedLoanOfficerId) }),
    deal.assignedProcessorId ? db.query.users.findFirst({ where: eq(users.id, deal.assignedProcessorId) }) : null,
    deal.assignedAssistantId ? db.query.users.findFirst({ where: eq(users.id, deal.assignedAssistantId) }) : null,
    deal.lenderId ? db.query.lenders.findFirst({ where: eq(lenders.id, deal.lenderId) }) : null,
  ]);

  return {
    // Borrower
    borrowerName: deal.borrowerName,
    borrowerFirstName: firstName(deal.borrowerName),
    borrowerLastName: lastName(deal.borrowerName),
    entityName: textOr(deal.borrowerEntityName),
    borrowerOrEntity: deal.borrowerEntityName ?? deal.borrowerName,
    borrowerPhone: textOr(deal.borrowerPhone),
    borrowerEmail: textOr(deal.borrowerEmail),
    maritalStatus: deal.maritalStatus ? labelFor(MARITAL_STATUSES, deal.maritalStatus) : "Not provided",
    citizenship: deal.citizenship ? labelFor(CITIZENSHIP_STATUSES, deal.citizenship) : "Not provided",
    fico: numOrNA(deal.estimatedFico),
    numFlips: numOrNA(deal.numFlips),
    numRentals: numOrNA(deal.numRentals),
    numNewConstruction: numOrNA(deal.numNewConstruction),
    experience:
      deal.numFlips === null && deal.numRentals === null && deal.numNewConstruction === null
        ? "Not provided"
        : `${deal.numFlips ?? 0} flips, ${deal.numRentals ?? 0} rentals, ${deal.numNewConstruction ?? 0} new construction (36mo)`,
    liquidity: money(deal.borrowerLiquidity),
    mortgageLatesLast12mo: yesNo(deal.mortgageLatesLast12mo),
    taxLiensBkForeclosureLast24mo: yesNo(deal.taxLiensBkForeclosureLast24mo),

    // Property
    propertyAddress: deal.propertyAddress,
    parcelId: textOr(deal.parcelId),
    propertyTypeLabel: deal.propertyType ? labelFor(PROPERTY_TYPES, deal.propertyType) : "Not provided",
    unitCount: numOrNA(deal.unitCount),
    exitStrategyLabel: deal.exitStrategy ? labelFor(EXIT_STRATEGIES, deal.exitStrategy) : "Not provided",
    ownsLand: yesNo(deal.propertyAlreadyOwned),
    purchaseDate: dateOrNA(deal.propertyPurchaseDate, "N/A"),
    purchaseDateShort: dateShort(deal.propertyPurchaseDate),
    occupancyLabel: deal.currentOccupancy ? labelFor(OCCUPANCY_STATUSES, deal.currentOccupancy) : "Not provided",
    rentalStrategyLabel: deal.rentalStrategy ? labelFor(RENTAL_STRATEGIES, deal.rentalStrategy) : "Not provided",
    rural: yesNo(deal.rural),
    propertyListedOnMarket: yesNo(deal.propertyListedOnMarket),

    // Financial
    purchasePrice: money(deal.purchasePrice),
    didRehabSincePurchase: yesNo(deal.didRehabSincePurchase),
    rehabBudget: money(deal.estimatedRehabCost),
    rehabDone: textOr(deal.rehabDescription),
    arv: money(deal.estimatedArv),
    asIsValue: money(deal.estimatedAsIsValue),
    asIsLotValue: money(deal.estimatedAsIsLotValue),
    currentBalanceOwed: money(deal.mortgagePayoffAmount),
    currentMonthlyMortgagePayment: money(deal.currentMonthlyMortgagePayment),
    monthlyRent: money(deal.currentRent),
    annualTaxes: money(deal.annualTaxes),
    annualInsurance: money(deal.annualInsurance),
    annualHoa: deal.annualHoa ? money(deal.annualHoa) : "N/A",
    capitalPartner: yesNo(deal.capitalPartner),

    // Loan
    loanNumber: deal.loanNumber.toString(),
    loanPurposeLabel: labelFor(LOAN_CATEGORIES, deal.loanCategory),
    dscrOrBridge: deal.loanCategory.startsWith("dscr") ? "DSCR" : "Bridge",
    transactionType: deal.loanCategory.includes("refinance") ? "Refinance" : "Purchase",
    loanAmountRequested: money(deal.loanAmountRequested),
    finalRate: pct(deal.finalRate),
    finalTerms: textOr(deal.finalTerms),
    finalAmortizationType: textOr(deal.finalAmortizationType),
    finalLoanTermYears: numOrNA(deal.finalLoanTermYears),
    finalLoanTermMonths: numOrNA(deal.finalLoanTermMonths),
    approvedLoanAmount: money(deal.approvedLoanAmount),
    loanAmount: money(deal.approvedLoanAmount ?? deal.loanAmountRequested),
    approvedLtv: pct(deal.approvedLtv),
    appraisedValue: money(deal.appraisedValue),
    costToBorrowerFee: money(deal.costToBorrowerFee),
    processingFeeOverride: deal.processingFeeOverride ? money(deal.processingFeeOverride) : "$999 (standard)",
    originationPointsLabel: `${deal.originationPointsOverride !== null ? Number(deal.originationPointsOverride) : 2}%`,
    rateLocked: yesNo(deal.rateLocked),
    rateLockedAt: dateOrNA(deal.rateLockedAt),
    creditPullDate: dateOrNA(deal.creditPullDate),
    closingDate: deal.estimatedClosingDate ? deal.estimatedClosingDate.toLocaleDateString() : "TBD",
    closingDateLine: deal.estimatedClosingDate
      ? `Anticipated Closing: ${deal.estimatedClosingDate.toLocaleDateString()}`
      : "",
    stageLabel: labelFor(STAGES, deal.stage),
    source: textOr(deal.source),

    // Staff / lender
    assignedLoanOfficerName: assignedLoanOfficer?.name ?? "Not provided",
    assignedLoanOfficerEmail: assignedLoanOfficer?.email ?? "Not provided",
    assignedProcessorName: assignedProcessor?.name ?? "Not provided",
    assignedProcessorEmail: assignedProcessor?.email ?? "Not provided",
    assignedAssistantName: assignedAssistant?.name ?? "Not provided",
    assignedAssistantEmail: assignedAssistant?.email ?? "Not provided",
    lenderName: lender?.name ?? "Not provided",

    // Insurance/title contacts
    ...buildContactTemplateTokens(deal),
  };
}
