import { parsePropertyAddress } from "@/lib/format";
import type { deals as dealsTable } from "@/server/db/schema";

type Deal = typeof dealsTable.$inferSelect;

function yesNo(value: boolean | null): string {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "";
}

function numStr(value: number | string | null): string {
  return value === null || value === undefined ? "" : String(value);
}

function dateInput(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "";
}

/**
 * Everything that carries over unchanged from a fix-and-flip/new-construction
 * deal onto its DSCR refinance conversion intake — borrower identity,
 * property location, and background questions. Financial fields specific to
 * the refinance itself (current value, rent, requested amount, etc.) are
 * deliberately left out here so the borrower answers them fresh. Every
 * carried-over field is also marked for the amber "please confirm" treatment
 * (see intake-form-fields.tsx) rather than the plain required-field look.
 */
export function buildConversionPrefill(deal: Deal): {
  defaultValues: Record<string, string>;
  highlightNames: Set<string>;
} {
  const [firstName = "", ...rest] = deal.borrowerName.trim().split(/\s+/);
  const address = parsePropertyAddress(deal.propertyAddress);

  const defaultValues: Record<string, string> = {
    borrowerEntityName: deal.borrowerEntityName ?? "",
    firstName,
    lastName: rest.join(" "),
    borrowerPhone: deal.borrowerPhone ?? "",
    borrowerEmail: deal.borrowerEmail ?? "",
    estimatedFico: numStr(deal.estimatedFico),
    propertyType: deal.propertyType ?? "",
    unitCount: numStr(deal.unitCount),
    numFlips: numStr(deal.numFlips),
    numRentals: numStr(deal.numRentals),
    numNewConstruction: numStr(deal.numNewConstruction),
    borrowerLiquidity: deal.borrowerLiquidity ?? "",
    streetAddress: address.street,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    rural: yesNo(deal.rural),
    purchasePrice: deal.purchasePrice ?? "",
    propertyPurchaseDate: dateInput(deal.propertyPurchaseDate),
    maritalStatus: deal.maritalStatus ?? "",
    citizenship: deal.citizenship ?? "",
    mortgageLatesLast12mo: yesNo(deal.mortgageLatesLast12mo),
    taxLiensBkForeclosureLast24mo: yesNo(deal.taxLiensBkForeclosureLast24mo),
    source: deal.source ?? "",
  };

  const highlightNames = new Set(Object.entries(defaultValues).filter(([, v]) => v !== "").map(([k]) => k));

  return { defaultValues, highlightNames };
}
