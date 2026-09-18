"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  RESIDENTIAL_PROPERTY_TYPES,
} from "@/lib/labels";
import { sectionsFor, rehabOrConstructionLabel } from "@/lib/loan-sections";

// Every field in this form is required unless its own label says
// "(optional)" — this marks the required ones so that's visible at a
// glance per-field, not just as a rule stated once at the top.
function Req() {
  return (
    <span className="text-destructive" aria-hidden="true">
      {" "}
      *
    </span>
  );
}

function SectionHeading({ number, title }: { number: number; title: string }) {
  return (
    <div className="flex items-center gap-3 border-b pb-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
        {number}
      </span>
      <h2 className="text-base font-semibold">{title}</h2>
    </div>
  );
}

function PortfolioPropertyBlock({ index }: { index: number }) {
  const p = (name: string) => `portfolioProperty_${index}_${name}`;
  return (
    <div className="rounded-md border p-4 space-y-4">
      <p className="text-sm font-medium">Property {index + 1}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="md:col-span-2 space-y-1.5">
          <Label htmlFor={p("street")}>
            Street Address
            <Req />
          </Label>
          <Input id={p("street")} name={p("street")} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={p("city")}>
            City
            <Req />
          </Label>
          <Input id={p("city")} name={p("city")} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={p("state")}>
            State
            <Req />
          </Label>
          <Input id={p("state")} name={p("state")} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={p("postalCode")}>
            Postal Code
            <Req />
          </Label>
          <Input id={p("postalCode")} name={p("postalCode")} required />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor={p("propertyType")}>
            Property Type
            <Req />
          </Label>
          <Select name={p("propertyType")} required>
            <SelectTrigger id={p("propertyType")} className="w-full">
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {PROPERTY_TYPES.map((pt) => (
                <SelectItem key={pt.value} value={pt.value}>
                  {pt.label}
                  {!RESIDENTIAL_PROPERTY_TYPES.includes(
                    pt.value as (typeof RESIDENTIAL_PROPERTY_TYPES)[number]
                  ) && " (not eligible for portfolio)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor={p("purchasePrice")}>
            Purchase Price
            <Req />
          </Label>
          <Input id={p("purchasePrice")} name={p("purchasePrice")} type="number" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={p("asIsValue")}>
            Estimated As-Is Value
            <Req />
          </Label>
          <Input id={p("asIsValue")} name={p("asIsValue")} type="number" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={p("currentRent")}>
            Current Rent
            <Req />
          </Label>
          <Input id={p("currentRent")} name={p("currentRent")} type="number" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={p("annualTaxes")}>
            Annual Taxes
            <Req />
          </Label>
          <Input id={p("annualTaxes")} name={p("annualTaxes")} type="number" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={p("annualInsurance")}>
            Annual Insurance
            <Req />
          </Label>
          <Input id={p("annualInsurance")} name={p("annualInsurance")} type="number" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={p("annualHoa")}>Annual HOA (optional)</Label>
          <Input id={p("annualHoa")} name={p("annualHoa")} type="number" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={p("rentalStrategy")}>
            Rental Strategy
            <Req />
          </Label>
          <Select name={p("rentalStrategy")} required>
            <SelectTrigger id={p("rentalStrategy")} className="w-full">
              <SelectValue placeholder="Select" />
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
        <div className="space-y-1.5">
          <Label htmlFor={p("occupancy")}>
            Current Occupancy
            <Req />
          </Label>
          <Select name={p("occupancy")} required>
            <SelectTrigger id={p("occupancy")} className="w-full">
              <SelectValue placeholder="Select" />
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
      </div>
    </div>
  );
}

export function IntakeFormFields({ defaultBorrowerPhone }: { defaultBorrowerPhone?: string } = {}) {
  const [category, setCategory] = useState("");
  const [fixFlipOwned, setFixFlipOwned] = useState(false);
  const [constructionOwnsLand, setConstructionOwnsLand] = useState(false);
  const [addressType, setAddressType] = useState<"address" | "parcel">("address");
  const [portfolioCount, setPortfolioCount] = useState<number | null>(null);

  const s = useMemo(() => sectionsFor(category), [category]);

  let sectionNum = 0;
  const nextSection = () => ++sectionNum;

  return (
    <div className="space-y-10">
      <div className="space-y-1.5">
        <Label htmlFor="loanCategory">
          Loan Type
          <Req />
        </Label>
        <Select name="loanCategory" value={category} onValueChange={setCategory} required>
          <SelectTrigger id="loanCategory" className="w-full">
            <SelectValue placeholder="Select a loan type" />
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

      {category && (
        <>
          <p className="text-xs text-muted-foreground">
            <span className="text-destructive">*</span> Required — every field is required unless marked{" "}
            <span className="italic">(optional)</span>.
          </p>

          <section className="space-y-4">
            <SectionHeading number={nextSection()} title="Borrower" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="borrowerEntityName">
                  Entity Name
                  <Req />
                </Label>
                <Input id="borrowerEntityName" name="borrowerEntityName" required />
                <p className="text-xs text-muted-foreground">
                  Most loans must close in an entity (LLC, Corp, etc.) — only some lenders allow
                  closing in a personal name, and that&apos;s the exception, not the norm. If your
                  entity isn&apos;t set up yet, enter &quot;TBD&quot; — you can confirm it later.
                </p>
              </div>
              <div />
              <div className="space-y-1.5">
                <Label htmlFor="firstName">
                  First Name
                  <Req />
                </Label>
                <Input id="firstName" name="firstName" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">
                  Last Name
                  <Req />
                </Label>
                <Input id="lastName" name="lastName" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="borrowerPhone">
                  Phone
                  <Req />
                </Label>
                <Input id="borrowerPhone" name="borrowerPhone" type="tel" defaultValue={defaultBorrowerPhone} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="borrowerEmail">
                  Email
                  <Req />
                </Label>
                <Input id="borrowerEmail" name="borrowerEmail" type="email" required />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <SectionHeading number={nextSection()} title="Loan Details" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="exitStrategy">
                  Exit Strategy
                  <Req />
                </Label>
                <Select name="exitStrategy" required>
                  <SelectTrigger id="exitStrategy" className="w-full">
                    <SelectValue placeholder="Select" />
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
                <Label htmlFor="estimatedFico">
                  Estimated FICO
                  <Req />
                </Label>
                <Input id="estimatedFico" name="estimatedFico" type="number" required />
              </div>
              {!s.isPortfolio && (
                <div className="space-y-1.5">
                  <Label htmlFor="propertyType">
                    Property Type
                    <Req />
                  </Label>
                  <Select name="propertyType" required>
                    <SelectTrigger id="propertyType" className="w-full">
                      <SelectValue placeholder="Select" />
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
              )}
              {!s.isPortfolio && (
                <div className="space-y-1.5">
                  <Label htmlFor="unitCount">
                    Unit Count
                    <Req />
                  </Label>
                  <Input id="unitCount" name="unitCount" type="number" required />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="requestedLoanAmount">
                  Requested Loan Amount
                  <Req />
                </Label>
                <Input id="requestedLoanAmount" name="requestedLoanAmount" type="number" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="borrowerLiquidity">
                  Borrower&apos;s Liquidity
                  <Req />
                </Label>
                <Input id="borrowerLiquidity" name="borrowerLiquidity" type="number" required />
                <p className="text-xs text-muted-foreground">How much capital do you have access to?</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="estimatedClosingDate">Estimated Closing Date (optional)</Label>
                <Input id="estimatedClosingDate" name="estimatedClosingDate" type="date" />
              </div>
            </div>

            <div>
              <Label>
                Borrower Experience
                <Req />
              </Label>
              <p className="text-xs text-muted-foreground mb-2">
                How many COMPLETED rentals/flips/new construction in the last 36 months? Enter 0 if none —
                pricing depends on having an answer for all three.
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="numFlips"># of Flips</Label>
                  <Input id="numFlips" name="numFlips" type="number" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="numRentals"># of Rentals</Label>
                  <Input id="numRentals" name="numRentals" type="number" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="numNewConstruction"># of New Construction</Label>
                  <Input id="numNewConstruction" name="numNewConstruction" type="number" required />
                </div>
              </div>
            </div>
          </section>

          {!s.isPortfolio && (
            <section className="space-y-4">
              <SectionHeading number={nextSection()} title="Subject Property Address" />

              {s.showConstructionLandOwnership && (
                <div className="space-y-1.5">
                  <Label htmlFor="addressType">
                    What do you have for this property?
                    <Req />
                  </Label>
                  <Select
                    name="addressType"
                    value={addressType}
                    onValueChange={(v) => setAddressType(v as "address" | "parcel")}
                    required
                  >
                    <SelectTrigger id="addressType" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="address">A street address</SelectItem>
                      <SelectItem value="parcel">Only a parcel ID / APN</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                {addressType === "parcel" && s.showConstructionLandOwnership ? (
                  <div className="md:col-span-2 space-y-1.5">
                    <Label htmlFor="parcelId">
                      Parcel ID / APN
                      <Req />
                    </Label>
                    <Input id="parcelId" name="parcelId" required />
                    <p className="text-xs text-muted-foreground">
                      The county Assessor&apos;s Parcel Number, if no street address has been assigned yet.
                    </p>
                  </div>
                ) : (
                  <div className="md:col-span-2 space-y-1.5">
                    <Label htmlFor="streetAddress">
                      Street Address
                      <Req />
                    </Label>
                    <Input id="streetAddress" name="streetAddress" required />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="city">
                    City
                    <Req />
                  </Label>
                  <Input id="city" name="city" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="state">
                    State
                    <Req />
                  </Label>
                  <Input id="state" name="state" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="postalCode">
                    Postal Code
                    <Req />
                  </Label>
                  <Input id="postalCode" name="postalCode" required />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rural">
                  Rural Property? Yes or No
                  <Req />
                </Label>
                <Select name="rural" required>
                  <SelectTrigger id="rural" className="w-full">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </section>
          )}

          {!s.isPortfolio && (s.showPurchasePrice || s.showRehabFields) && (
            <section className="space-y-4">
              <SectionHeading number={nextSection()} title="Deal Economics" />

              {s.showFixFlipOwnership && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    name="propertyAlreadyOwned"
                    checked={fixFlipOwned}
                    onCheckedChange={(v) => setFixFlipOwned(v === true)}
                  />
                  I already own this property
                </label>
              )}

              {s.showConstructionLandOwnership && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    name="propertyAlreadyOwned"
                    checked={constructionOwnsLand}
                    onCheckedChange={(v) => setConstructionOwnsLand(v === true)}
                  />
                  I already own the land
                </label>
              )}

              {((s.showFixFlipOwnership && fixFlipOwned) ||
                (s.showConstructionLandOwnership && constructionOwnsLand) ||
                s.showRefinanceFields) && (
                <div className="space-y-1.5 max-w-xs">
                  <Label htmlFor="propertyPurchaseDate">
                    {s.showConstructionLandOwnership ? "When did you purchase the land?" : "When did you purchase the property?"}
                    <Req />
                  </Label>
                  <Input id="propertyPurchaseDate" name="propertyPurchaseDate" type="date" required />
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {s.showPurchasePrice && (
                  <div className="space-y-1.5">
                    <Label htmlFor="purchasePrice">
                      {s.showConstructionLandOwnership ? "Land Purchase Price" : "Purchase Price"}
                      <Req />
                    </Label>
                    <Input id="purchasePrice" name="purchasePrice" type="number" required />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="estimatedAsIsValue">
                    {s.showConstructionLandOwnership ? "Estimated Lot Value" : "Estimated As-Is Value"}
                    <Req />
                  </Label>
                  <Input id="estimatedAsIsValue" name="estimatedAsIsValue" type="number" required />
                </div>
                {s.showLotValue && (
                  <div className="space-y-1.5">
                    <Label htmlFor="estimatedAsIsLotValue">Estimated As-Is Lot Value (optional)</Label>
                    <Input id="estimatedAsIsLotValue" name="estimatedAsIsLotValue" type="number" />
                  </div>
                )}
                {s.showRehabFields && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="estimatedRehabCost">
                        Estimated {rehabOrConstructionLabel(category)} Cost
                        <Req />
                      </Label>
                      <Input id="estimatedRehabCost" name="estimatedRehabCost" type="number" required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="estimatedArv">
                        Estimated ARV (After Repair Value)
                        <Req />
                      </Label>
                      <Input id="estimatedArv" name="estimatedArv" type="number" required />
                    </div>
                  </>
                )}
                {s.showRefinanceFields && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="mortgagePayoffAmount">
                        Amount of Mortgage Owed / Payoff Amount
                        <Req />
                      </Label>
                      <Input id="mortgagePayoffAmount" name="mortgagePayoffAmount" type="number" required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="currentMonthlyMortgagePayment">Current Monthly Mortgage Payment (optional)</Label>
                      <Input id="currentMonthlyMortgagePayment" name="currentMonthlyMortgagePayment" type="number" />
                    </div>
                  </>
                )}
              </div>

              {s.showRehabFields && (
                <div className="space-y-1.5">
                  <Label htmlFor="rehabDescription">
                    Brief Description of {rehabOrConstructionLabel(category)}
                    <Req />
                  </Label>
                  <Textarea id="rehabDescription" name="rehabDescription" rows={3} required />
                </div>
              )}

              {s.showRefinanceFields && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox name="propertyListedOnMarket" />
                  Property is currently listed on the market
                </label>
              )}
            </section>
          )}

          {s.showRental && (
            <section className="space-y-4">
              <SectionHeading number={nextSection()} title="Rental Details" />
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="currentRent">
                    Current Rent
                    <Req />
                  </Label>
                  <Input id="currentRent" name="currentRent" type="number" required />
                  <p className="text-xs text-muted-foreground">Or estimated long-term rent (no STR/coliving projections).</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="annualTaxes">
                    Annual Taxes
                    <Req />
                  </Label>
                  <Input id="annualTaxes" name="annualTaxes" type="number" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="annualInsurance">
                    Annual Insurance
                    <Req />
                  </Label>
                  <Input id="annualInsurance" name="annualInsurance" type="number" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="annualHoa">Annual HOA (optional)</Label>
                  <Input id="annualHoa" name="annualHoa" type="number" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rentalStrategy">
                    Rental Strategy
                    <Req />
                  </Label>
                  <Select name="rentalStrategy" required>
                    <SelectTrigger id="rentalStrategy" className="w-full">
                      <SelectValue placeholder="Select" />
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
                <div className="space-y-1.5">
                  <Label htmlFor="currentOccupancy">
                    Current Occupancy
                    <Req />
                  </Label>
                  <Select name="currentOccupancy" required>
                    <SelectTrigger id="currentOccupancy" className="w-full">
                      <SelectValue placeholder="Select" />
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
              </div>
            </section>
          )}

          {s.isPortfolio && (
            <section className="space-y-4">
              <SectionHeading number={nextSection()} title="Portfolio Properties" />
              <p className="text-sm text-muted-foreground">
                Portfolio loans are limited to 1-4 unit residential properties (Single Family
                through Fourplex) — a 5+ unit or mixed-use property can&apos;t be included here;
                email that property to us separately.
              </p>
              <div className="max-w-xs space-y-1.5">
                <Label htmlFor="portfolioPropertyCount">
                  How many properties are in this portfolio?
                  <Req />
                </Label>
                <Input
                  id="portfolioPropertyCount"
                  name="portfolioPropertyCount"
                  type="number"
                  min={1}
                  max={50}
                  required
                  value={portfolioCount ?? ""}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    setPortfolioCount(Number.isFinite(n) && n > 0 ? Math.min(n, 50) : null);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Answer this first — the property details below are added automatically to match.
                </p>
              </div>

              {portfolioCount !== null && (
                <div className="space-y-4">
                  {Array.from({ length: portfolioCount }).map((_, i) => (
                    <PortfolioPropertyBlock key={i} index={i} />
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="space-y-4">
            <SectionHeading number={nextSection()} title="Background" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="maritalStatus">
                  Borrower&apos;s Marital Status
                  <Req />
                </Label>
                <Select name="maritalStatus" required>
                  <SelectTrigger id="maritalStatus" className="w-full">
                    <SelectValue placeholder="Select" />
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
                <Label htmlFor="citizenship">
                  Citizenship
                  <Req />
                </Label>
                <Select name="citizenship" required>
                  <SelectTrigger id="citizenship" className="w-full">
                    <SelectValue placeholder="Select" />
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
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="mortgageLatesLast12mo">
                  Do you have any mortgage lates on any properties you own in the last 12 months?
                  <Req />
                </Label>
                <Select name="mortgageLatesLast12mo" required>
                  <SelectTrigger id="mortgageLatesLast12mo" className="w-full">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="taxLiensBkForeclosureLast24mo">
                  Do you have any possible tax liens, bankruptcy, or foreclosure in the last 24 months?
                  <Req />
                </Label>
                <Select name="taxLiensBkForeclosureLast24mo" required>
                  <SelectTrigger id="taxLiensBkForeclosureLast24mo" className="w-full">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="source">Who Referred You? (optional)</Label>
              <Input id="source" name="source" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="additionalNotes">Additional notes for us? (optional)</Label>
              <Textarea id="additionalNotes" name="additionalNotes" rows={3} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}
