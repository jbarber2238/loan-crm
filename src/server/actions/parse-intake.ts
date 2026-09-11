import { COMMERCIAL_PROPERTY_TYPES } from "@/server/db/schema";

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length ? trimmed : null;
}

function num(formData: FormData, key: string): string | null {
  return str(formData, key);
}

function int(formData: FormData, key: string): number | null {
  const value = str(formData, key);
  return value !== null ? parseInt(value, 10) : null;
}

function bool(formData: FormData, key: string): boolean {
  return formData.get(key) === "on";
}

// For fields rendered as an explicit Yes/No select rather than a checkbox
// (a checkbox's "unchecked" is ambiguous between "No" and "skipped").
function yesNo(formData: FormData, key: string): boolean {
  return formData.get(key) === "yes";
}

function date(formData: FormData, key: string): Date | null {
  const value = str(formData, key);
  return value ? new Date(value) : null;
}

export interface ParsedPortfolioProperty {
  streetAddress: string;
  city: string;
  state: string;
  postalCode: string;
  propertyType: string;
  purchasePrice: string | null;
  estimatedAsIsValue: string | null;
  currentRent: string | null;
  annualTaxes: string | null;
  annualInsurance: string | null;
  annualHoa: string | null;
  rentalStrategy: string | null;
  currentOccupancy: string | null;
}

export interface ParsedIntake {
  loanCategory: string;
  borrowerEntityName: string | null;
  firstName: string;
  lastName: string;
  borrowerPhone: string;
  borrowerEmail: string;
  exitStrategy: string | null;
  estimatedFico: number | null;
  propertyType: string | null;
  unitCount: number | null;
  requestedLoanAmount: string | null;
  borrowerLiquidity: string | null;
  estimatedClosingDate: Date | null;
  numFlips: number | null;
  numRentals: number | null;
  numNewConstruction: number | null;
  streetAddress: string | null;
  parcelId: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  rural: boolean;
  propertyAlreadyOwned: boolean;
  propertyPurchaseDate: Date | null;
  purchasePrice: string | null;
  estimatedAsIsValue: string | null;
  estimatedAsIsLotValue: string | null;
  estimatedRehabCost: string | null;
  estimatedArv: string | null;
  rehabDescription: string | null;
  mortgagePayoffAmount: string | null;
  currentMonthlyMortgagePayment: string | null;
  propertyListedOnMarket: boolean;
  currentRent: string | null;
  annualTaxes: string | null;
  annualInsurance: string | null;
  annualHoa: string | null;
  rentalStrategy: string | null;
  currentOccupancy: string | null;
  maritalStatus: string | null;
  citizenship: string | null;
  mortgageLatesLast12mo: boolean;
  taxLiensBkForeclosureLast24mo: boolean;
  source: string | null;
  additionalNotes: string | null;
  marketingConsent: boolean;
  portfolioProperties: ParsedPortfolioProperty[];
}

export function parseIntakeFormData(formData: FormData): ParsedIntake {
  const propertyCount = int(formData, "portfolioPropertyCount") ?? 0;
  const portfolioProperties: ParsedPortfolioProperty[] = [];
  for (let i = 0; i < propertyCount; i++) {
    const p = (name: string) => `portfolioProperty_${i}_${name}`;
    portfolioProperties.push({
      streetAddress: str(formData, p("street")) ?? "",
      city: str(formData, p("city")) ?? "",
      state: str(formData, p("state")) ?? "",
      postalCode: str(formData, p("postalCode")) ?? "",
      propertyType: str(formData, p("propertyType")) ?? "",
      purchasePrice: num(formData, p("purchasePrice")),
      estimatedAsIsValue: num(formData, p("asIsValue")),
      currentRent: num(formData, p("currentRent")),
      annualTaxes: num(formData, p("annualTaxes")),
      annualInsurance: num(formData, p("annualInsurance")),
      annualHoa: num(formData, p("annualHoa")),
      rentalStrategy: str(formData, p("rentalStrategy")),
      currentOccupancy: str(formData, p("occupancy")),
    });
  }

  return {
    loanCategory: str(formData, "loanCategory") ?? "",
    borrowerEntityName: str(formData, "borrowerEntityName"),
    firstName: str(formData, "firstName") ?? "",
    lastName: str(formData, "lastName") ?? "",
    borrowerPhone: str(formData, "borrowerPhone") ?? "",
    borrowerEmail: str(formData, "borrowerEmail") ?? "",
    exitStrategy: str(formData, "exitStrategy"),
    estimatedFico: int(formData, "estimatedFico"),
    propertyType: str(formData, "propertyType"),
    unitCount: int(formData, "unitCount"),
    requestedLoanAmount: num(formData, "requestedLoanAmount"),
    borrowerLiquidity: num(formData, "borrowerLiquidity"),
    estimatedClosingDate: date(formData, "estimatedClosingDate"),
    numFlips: int(formData, "numFlips"),
    numRentals: int(formData, "numRentals"),
    numNewConstruction: int(formData, "numNewConstruction"),
    streetAddress: str(formData, "streetAddress"),
    parcelId: str(formData, "parcelId"),
    city: str(formData, "city"),
    state: str(formData, "state"),
    postalCode: str(formData, "postalCode"),
    rural: yesNo(formData, "rural"),
    propertyAlreadyOwned: bool(formData, "propertyAlreadyOwned"),
    propertyPurchaseDate: date(formData, "propertyPurchaseDate"),
    purchasePrice: num(formData, "purchasePrice"),
    estimatedAsIsValue: num(formData, "estimatedAsIsValue"),
    estimatedAsIsLotValue: num(formData, "estimatedAsIsLotValue"),
    estimatedRehabCost: num(formData, "estimatedRehabCost"),
    estimatedArv: num(formData, "estimatedArv"),
    rehabDescription: str(formData, "rehabDescription"),
    mortgagePayoffAmount: num(formData, "mortgagePayoffAmount"),
    currentMonthlyMortgagePayment: num(formData, "currentMonthlyMortgagePayment"),
    propertyListedOnMarket: bool(formData, "propertyListedOnMarket"),
    currentRent: num(formData, "currentRent"),
    annualTaxes: num(formData, "annualTaxes"),
    annualInsurance: num(formData, "annualInsurance"),
    annualHoa: num(formData, "annualHoa"),
    rentalStrategy: str(formData, "rentalStrategy"),
    currentOccupancy: str(formData, "currentOccupancy"),
    maritalStatus: str(formData, "maritalStatus"),
    citizenship: str(formData, "citizenship"),
    mortgageLatesLast12mo: yesNo(formData, "mortgageLatesLast12mo"),
    taxLiensBkForeclosureLast24mo: yesNo(formData, "taxLiensBkForeclosureLast24mo"),
    source: str(formData, "source"),
    additionalNotes: str(formData, "additionalNotes"),
    marketingConsent: bool(formData, "marketingConsent"),
    portfolioProperties,
  };
}

export function findIneligiblePortfolioProperty(properties: ParsedPortfolioProperty[]) {
  return properties.find((p) =>
    COMMERCIAL_PROPERTY_TYPES.includes(p.propertyType as (typeof COMMERCIAL_PROPERTY_TYPES)[number])
  );
}

/** Builds the deals-table field set shared by both the public intake and the
 * staff "new deal" form — everything except borrower name / property address
 * / loan amount / assignment, which the two callers derive differently. */
export function intakeToDealFields(parsed: ParsedIntake) {
  return {
    parcelId: parsed.parcelId,
    estimatedFico: parsed.estimatedFico,
    propertyType: parsed.propertyType as never,
    unitCount: parsed.unitCount,
    exitStrategy: parsed.exitStrategy as never,
    numFlips: parsed.numFlips,
    numRentals: parsed.numRentals,
    numNewConstruction: parsed.numNewConstruction,
    propertyAlreadyOwned: parsed.propertyAlreadyOwned,
    propertyPurchaseDate: parsed.propertyPurchaseDate,
    estimatedRehabCost: parsed.estimatedRehabCost,
    rehabDescription: parsed.rehabDescription,
    estimatedArv: parsed.estimatedArv,
    estimatedAsIsValue: parsed.estimatedAsIsValue,
    estimatedAsIsLotValue: parsed.estimatedAsIsLotValue,
    mortgagePayoffAmount: parsed.mortgagePayoffAmount,
    propertyListedOnMarket: parsed.propertyListedOnMarket,
    currentMonthlyMortgagePayment: parsed.currentMonthlyMortgagePayment,
    currentRent: parsed.currentRent,
    annualTaxes: parsed.annualTaxes,
    annualInsurance: parsed.annualInsurance,
    annualHoa: parsed.annualHoa,
    rentalStrategy: parsed.rentalStrategy as never,
    currentOccupancy: parsed.currentOccupancy as never,
    estimatedClosingDate: parsed.estimatedClosingDate,
    rural: parsed.rural,
    maritalStatus: parsed.maritalStatus as never,
    citizenship: parsed.citizenship as never,
    mortgageLatesLast12mo: parsed.mortgageLatesLast12mo,
    taxLiensBkForeclosureLast24mo: parsed.taxLiensBkForeclosureLast24mo,
    borrowerLiquidity: parsed.borrowerLiquidity,
    marketingConsent: parsed.marketingConsent,
  };
}
