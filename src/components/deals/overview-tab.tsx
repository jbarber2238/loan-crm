import { ChevronDown } from "lucide-react";
import { updateDealDetails } from "@/server/actions/deals";
import { ActionForm } from "@/components/forms/action-form";
import { SubmitButton } from "@/components/forms/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CITIZENSHIP_STATUSES,
  EXIT_STRATEGIES,
  LOAN_CATEGORIES,
  MARITAL_STATUSES,
  OCCUPANCY_STATUSES,
  PROPERTY_TYPES,
  RENTAL_STRATEGIES,
} from "@/lib/labels";
import { DscrCalculator } from "@/components/deals/dscr-calculator";
import { CollapseAllButton } from "@/components/deals/collapse-all-button";
import { AiLenderMatchSection } from "@/components/deals/ai-lender-match-section";
import { sectionsFor, rehabOrConstructionBudgetLabel } from "@/lib/loan-sections";
import { conservativeValueBasis } from "@/lib/term-sheet-calculations";
import type { deals as dealsTable } from "@/server/db/schema";
import type { ReactNode } from "react";

type Deal = typeof dealsTable.$inferSelect & {
  lender?: { name: string } | null;
  product?: { name: string } | null;
};

function toDateInputValue(date: Date | null) {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

function yesNoDefault(value: boolean | null): string | undefined {
  if (value === true) return "yes";
  if (value === false) return "no";
  return undefined;
}

function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group rounded-lg border">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t px-4 py-4">{children}</div>
    </details>
  );
}

const DSCR_CATEGORIES = new Set([
  "dscr_purchase",
  "dscr_cash_out_refinance",
  "dscr_rate_term_refinance",
]);

export function OverviewTab({ deal }: { deal: Deal }) {
  const updateDetails = updateDealDetails.bind(null, deal.id);
  const s = sectionsFor(deal.loanCategory);

  const purchasePrice = deal.purchasePrice ? Number(deal.purchasePrice) : null;
  const estimatedAsIsValue = deal.estimatedAsIsValue ? Number(deal.estimatedAsIsValue) : null;
  const loanAmount = Number(deal.loanAmountRequested);
  // A refinance has no purchase happening — "purchase price" on one of these
  // deals is really the property's *original* purchase price (a historical
  // data point, still collected for some lenders), not what's being
  // financed now. conservativeValueBasis keeps that out of the LTV basis entirely
  // for a refinance and uses as-is value alone; a purchase still anchors to
  // whichever of purchase price / as-is value is lower.
  const valueBasis = conservativeValueBasis(deal.loanCategory, purchasePrice, estimatedAsIsValue);
  const ratioFlag =
    valueBasis && loanAmount ? valueBasis / loanAmount > 3 || valueBasis / loanAmount < 0.33 : false;
  const requestedLtv = valueBasis ? (loanAmount / valueBasis) * 100 : null;
  // Rough guide to how achievable a requested LTV is: 80% and under is normal
  // and widely placeable, up to 90% narrows the field, above that very few
  // lenders (if any) will do it.
  const ltvVariant: "success" | "warning" | "destructive" | null =
    requestedLtv === null ? null : requestedLtv <= 80 ? "success" : requestedLtv <= 90 ? "warning" : "destructive";

  // Rehab/construction deals (fix-and-flip, new construction, bridge) don't
  // work off a straight purchase-price LTV — the loan is sized against the
  // after-repair value and against the total cost of the project, not the
  // land/as-is purchase price alone. Loan far exceeding purchase price here
  // is normal (that's the construction budget), not a red flag.
  const rehabCost = deal.estimatedRehabCost ? Number(deal.estimatedRehabCost) : null;
  const arv = deal.estimatedArv ? Number(deal.estimatedArv) : null;
  const totalProjectCost = purchasePrice !== null && rehabCost !== null ? purchasePrice + rehabCost : null;
  const ltarv = arv ? (loanAmount / arv) * 100 : null;
  const ltc = totalProjectCost ? (loanAmount / totalProjectCost) * 100 : null;
  // Typical hard-money guardrails: up to 70% LTARV / 85% LTC is comfortably
  // placeable, up to 75%/90% narrows the field, above that very few lenders
  // will do it.
  const ltarvVariant: "success" | "warning" | "destructive" | null =
    ltarv === null ? null : ltarv <= 70 ? "success" : ltarv <= 75 ? "warning" : "destructive";
  const ltcVariant: "success" | "warning" | "destructive" | null =
    ltc === null ? null : ltc <= 85 ? "success" : ltc <= 90 ? "warning" : "destructive";

  return (
    <div className="space-y-6">
      {s.showProjectEconomics
        ? purchasePrice !== null && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
              <span className="text-sm text-muted-foreground">
                {s.showConstructionLandOwnership ? "Land purchase price" : "Purchase price"}: $
                {purchasePrice.toLocaleString()}.
                {rehabCost !== null && ` Rehab/construction cost: $${rehabCost.toLocaleString()}.`} Requested loan
                amount: ${loanAmount.toLocaleString()}.
              </span>
              {ltarvVariant && <Badge variant={ltarvVariant}>{ltarv!.toFixed(1)}% LTARV</Badge>}
              {ltcVariant && <Badge variant={ltcVariant}>{ltc!.toFixed(1)}% LTC</Badge>}
            </div>
          )
        : requestedLtv !== null && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
              <span className="text-sm text-muted-foreground">
                {s.showRefinanceFields || purchasePrice === null
                  ? `As-is value: $${estimatedAsIsValue!.toLocaleString()}.`
                  : `Purchase price: $${purchasePrice.toLocaleString()}.`}{" "}
                Requested Loan Amount: ${loanAmount.toLocaleString()}.
              </span>
              {ltvVariant && <Badge variant={ltvVariant}>{requestedLtv.toFixed(1)}% LTV</Badge>}
              {ratioFlag && <Badge variant="destructive">Check this — ratio looks off</Badge>}
            </div>
          )}

      {DSCR_CATEGORIES.has(deal.loanCategory) && (
        <DscrCalculator
          loanAmount={loanAmount}
          currentRent={deal.currentRent}
          annualTaxes={deal.annualTaxes}
          annualInsurance={deal.annualInsurance}
          annualHoa={deal.annualHoa}
        />
      )}

      <ActionForm action={updateDetails} successMessage="Deal details saved" className="space-y-4">
        <div id="loan-inquiry-sections" className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-2 border-b pb-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Loan Inquiry
              </h2>
              <p className="text-xs text-muted-foreground">Information the borrower provided</p>
            </div>
            <CollapseAllButton containerId="loan-inquiry-sections" />
          </div>

        <Section title="Borrower" defaultOpen>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="borrowerName">Borrower name</Label>
              <Input id="borrowerName" name="borrowerName" defaultValue={deal.borrowerName} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="borrowerEntityName">Borrower entity name</Label>
              <Input
                id="borrowerEntityName"
                name="borrowerEntityName"
                defaultValue={deal.borrowerEntityName ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="borrowerPhone">Borrower phone</Label>
              <Input id="borrowerPhone" name="borrowerPhone" defaultValue={deal.borrowerPhone ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="borrowerEmail">Borrower email</Label>
              <Input id="borrowerEmail" name="borrowerEmail" defaultValue={deal.borrowerEmail ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="maritalStatus">Marital status</Label>
              <Select name="maritalStatus" defaultValue={deal.maritalStatus ?? undefined}>
                <SelectTrigger id="maritalStatus" className="w-full">
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  {MARITAL_STATUSES.map((ms) => (
                    <SelectItem key={ms.value} value={ms.value}>
                      {ms.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="citizenship">Citizenship</Label>
              <Select name="citizenship" defaultValue={deal.citizenship ?? undefined}>
                <SelectTrigger id="citizenship" className="w-full">
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  {CITIZENSHIP_STATUSES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </Section>

        <Section title="Borrower Background">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="mortgageLatesLast12mo">
                Mortgage late in the last 12 months? Yes or No
              </Label>
              <Select name="mortgageLatesLast12mo" defaultValue={yesNoDefault(deal.mortgageLatesLast12mo)}>
                <SelectTrigger id="mortgageLatesLast12mo" className="w-full">
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="taxLiensBkForeclosureLast24mo">
                Tax lien / BK / foreclosure in the last 24 months? Yes or No
              </Label>
              <Select
                name="taxLiensBkForeclosureLast24mo"
                defaultValue={yesNoDefault(deal.taxLiensBkForeclosureLast24mo)}
              >
                <SelectTrigger id="taxLiensBkForeclosureLast24mo" className="w-full">
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="marketingConsent" defaultChecked={deal.marketingConsent ?? false} />
            Marketing consent
          </label>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="borrowerLiquidity">Borrower liquidity</Label>
              <Input
                id="borrowerLiquidity"
                name="borrowerLiquidity"
                type="number"
                defaultValue={deal.borrowerLiquidity ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="source">Source</Label>
              <Input id="source" name="source" defaultValue={deal.source ?? ""} />
            </div>
          </div>
        </Section>

        <Section title="Borrower Experience">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="numFlips"># of flips (36mo)</Label>
              <Input id="numFlips" name="numFlips" type="number" defaultValue={deal.numFlips ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="numRentals"># of rentals (36mo)</Label>
              <Input id="numRentals" name="numRentals" type="number" defaultValue={deal.numRentals ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="numNewConstruction"># of new construction (36mo)</Label>
              <Input
                id="numNewConstruction"
                name="numNewConstruction"
                type="number"
                defaultValue={deal.numNewConstruction ?? ""}
              />
            </div>
          </div>
        </Section>

        {!s.isPortfolio && (
          <Section title="Property" defaultOpen>
            <div className="space-y-1.5">
              <Label htmlFor="propertyAddress">Property address</Label>
              <Input
                id="propertyAddress"
                name="propertyAddress"
                defaultValue={deal.propertyAddress}
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="parcelId">Parcel ID / APN</Label>
                <Input id="parcelId" name="parcelId" defaultValue={deal.parcelId ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="propertyType">Property type</Label>
                <Select name="propertyType" defaultValue={deal.propertyType ?? undefined}>
                  <SelectTrigger id="propertyType" className="w-full">
                    <SelectValue placeholder="Not set" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROPERTY_TYPES.map((pt) => (
                      <SelectItem key={pt.value} value={pt.value}>
                        {pt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="unitCount">Unit count</Label>
                <Input id="unitCount" name="unitCount" type="number" defaultValue={deal.unitCount ?? ""} />
              </div>
              {s.showRental && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="currentOccupancy">Current occupancy</Label>
                    <Select name="currentOccupancy" defaultValue={deal.currentOccupancy ?? undefined}>
                      <SelectTrigger id="currentOccupancy" className="w-full">
                        <SelectValue placeholder="Not set" />
                      </SelectTrigger>
                      <SelectContent>
                        {OCCUPANCY_STATUSES.map((os) => (
                          <SelectItem key={os.value} value={os.value}>
                            {os.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rentalStrategy">Rental strategy</Label>
                    <Select name="rentalStrategy" defaultValue={deal.rentalStrategy ?? undefined}>
                      <SelectTrigger id="rentalStrategy" className="w-full">
                        <SelectValue placeholder="Not set" />
                      </SelectTrigger>
                      <SelectContent>
                        {RENTAL_STRATEGIES.map((rs) => (
                          <SelectItem key={rs.value} value={rs.value}>
                            {rs.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              {s.showRental && (
                <div className="space-y-1.5">
                  <Label htmlFor="currentRent">Current rent</Label>
                  <Input id="currentRent" name="currentRent" type="number" defaultValue={deal.currentRent ?? ""} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="annualTaxes">Annual taxes</Label>
                <Input id="annualTaxes" name="annualTaxes" type="number" defaultValue={deal.annualTaxes ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="annualInsurance">Annual insurance</Label>
                <Input
                  id="annualInsurance"
                  name="annualInsurance"
                  type="number"
                  defaultValue={deal.annualInsurance ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="annualHoa">Annual HOA</Label>
                <Input id="annualHoa" name="annualHoa" type="number" defaultValue={deal.annualHoa ?? ""} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="estimatedAsIsValue">
                  {s.showConstructionLandOwnership ? "Estimated lot value" : "Estimated as-is value"}
                </Label>
                <Input
                  id="estimatedAsIsValue"
                  name="estimatedAsIsValue"
                  type="number"
                  defaultValue={deal.estimatedAsIsValue ?? ""}
                />
              </div>
              {s.showLotValue && (
                <div className="space-y-1.5">
                  <Label htmlFor="estimatedAsIsLotValue">Estimated as-is lot value</Label>
                  <Input
                    id="estimatedAsIsLotValue"
                    name="estimatedAsIsLotValue"
                    type="number"
                    defaultValue={deal.estimatedAsIsLotValue ?? ""}
                  />
                </div>
              )}
            </div>
            <div className="max-w-xs space-y-1.5">
              <Label htmlFor="rural">Rural Property? Yes or No</Label>
              <Select name="rural" defaultValue={yesNoDefault(deal.rural)}>
                <SelectTrigger id="rural" className="w-full">
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Section>
        )}

        <Section title="Loan" defaultOpen>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="loanCategory">Loan category</Label>
              <Select name="loanCategory" defaultValue={deal.loanCategory} required>
                <SelectTrigger id="loanCategory" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOAN_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loanAmountRequested">Loan amount requested</Label>
              <Input
                id="loanAmountRequested"
                name="loanAmountRequested"
                type="number"
                defaultValue={deal.loanAmountRequested}
                required
              />
            </div>
            {s.showPurchasePrice && (
              <div className="space-y-1.5">
                <Label htmlFor="purchasePrice">Purchase price</Label>
                <Input
                  id="purchasePrice"
                  name="purchasePrice"
                  type="number"
                  defaultValue={deal.purchasePrice ?? ""}
                />
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="exitStrategy">Exit strategy</Label>
              <Select name="exitStrategy" defaultValue={deal.exitStrategy ?? undefined}>
                <SelectTrigger id="exitStrategy" className="w-full">
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  {EXIT_STRATEGIES.map((es) => (
                    <SelectItem key={es.value} value={es.value}>
                      {es.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="estimatedFico">Estimated FICO</Label>
              <Input id="estimatedFico" name="estimatedFico" type="number" defaultValue={deal.estimatedFico ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="estimatedClosingDate">Estimated closing date</Label>
              <Input
                id="estimatedClosingDate"
                name="estimatedClosingDate"
                type="date"
                defaultValue={toDateInputValue(deal.estimatedClosingDate)}
              />
            </div>
          </div>
        </Section>

        {s.showRehabFields && (
          <Section title={rehabOrConstructionBudgetLabel(deal.loanCategory)}>
            {(s.showFixFlipOwnership || s.showConstructionLandOwnership) && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox name="propertyAlreadyOwned" defaultChecked={deal.propertyAlreadyOwned ?? false} />
                {s.showConstructionLandOwnership ? "Already owns the land" : "Already owns the property"}
              </label>
            )}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="propertyPurchaseDate">
                  {s.showConstructionLandOwnership ? "Land purchase date" : "Property purchase date"}
                </Label>
                <Input
                  id="propertyPurchaseDate"
                  name="propertyPurchaseDate"
                  type="date"
                  defaultValue={toDateInputValue(deal.propertyPurchaseDate)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="estimatedRehabCost">{rehabOrConstructionBudgetLabel(deal.loanCategory)}</Label>
                <Input
                  id="estimatedRehabCost"
                  name="estimatedRehabCost"
                  type="number"
                  defaultValue={deal.estimatedRehabCost ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="estimatedArv">Estimated ARV</Label>
                <Input id="estimatedArv" name="estimatedArv" type="number" defaultValue={deal.estimatedArv ?? ""} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rehabDescription">{rehabOrConstructionBudgetLabel(deal.loanCategory)} Description</Label>
              <Textarea
                id="rehabDescription"
                name="rehabDescription"
                rows={3}
                defaultValue={deal.rehabDescription ?? ""}
              />
            </div>
          </Section>
        )}

        {s.showRefinanceFields && (
          <Section title="Refinance">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="propertyPurchaseDate">Property purchase date</Label>
                <Input
                  id="propertyPurchaseDate"
                  name="propertyPurchaseDate"
                  type="date"
                  defaultValue={toDateInputValue(deal.propertyPurchaseDate)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mortgagePayoffAmount">Mortgage payoff amount</Label>
                <Input
                  id="mortgagePayoffAmount"
                  name="mortgagePayoffAmount"
                  type="number"
                  defaultValue={deal.mortgagePayoffAmount ?? ""}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="currentMonthlyMortgagePayment">Current monthly mortgage payment</Label>
                <Input
                  id="currentMonthlyMortgagePayment"
                  name="currentMonthlyMortgagePayment"
                  type="number"
                  defaultValue={deal.currentMonthlyMortgagePayment ?? ""}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox name="propertyListedOnMarket" defaultChecked={deal.propertyListedOnMarket ?? false} />
              Property currently listed on the market
            </label>

            {s.showCashOutRefiRehabQuestion && (
              <div className="space-y-4 border-t pt-4">
                <div className="max-w-xs space-y-1.5">
                  <Label htmlFor="didRehabSincePurchase">Did they do rehab since purchasing?</Label>
                  <Select name="didRehabSincePurchase" defaultValue={yesNoDefault(deal.didRehabSincePurchase)}>
                    <SelectTrigger id="didRehabSincePurchase" className="w-full">
                      <SelectValue placeholder="Not set" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="estimatedRehabCost">Rehab cost</Label>
                    <Input
                      id="estimatedRehabCost"
                      name="estimatedRehabCost"
                      type="number"
                      defaultValue={deal.estimatedRehabCost ?? ""}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rehabDescription">Rehab description</Label>
                  <Textarea
                    id="rehabDescription"
                    name="rehabDescription"
                    rows={3}
                    defaultValue={deal.rehabDescription ?? ""}
                  />
                </div>
              </div>
            )}
          </Section>
        )}
        </div>

        <SubmitButton>Save</SubmitButton>
      </ActionForm>

      <AiLenderMatchSection dealId={deal.id} initialResult={deal.aiLenderMatch} />
    </div>
  );
}
