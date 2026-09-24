import type { CustomFormDefinition } from "./types";

const YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;

// Mirrors CV3's own DSCR Purchase application field-for-field, restricted
// to the choices that actually apply to this business (e.g. no "Individual"
// title-holding option — see project notes from 2026-09-24). Refinance-only
// fields (current lender, payoff amount) are deliberately left out; a
// DSCR refinance variant of this form is a later addition.
export const CV3_DSCR_PURCHASE: CustomFormDefinition = {
  key: "cv3_dscr_purchase",
  label: "CV3 — DSCR Purchase Application",
  sections: [
    {
      title: "Loan Structure",
      fields: [
        {
          name: "titleHolding",
          label: "How will you hold title?",
          type: "select",
          options: [
            { value: "entity", label: "Entity" },
            { value: "retirement_entity", label: "Retirement Entity" },
            { value: "trust", label: "Trust" },
          ],
        },
        {
          name: "entityType",
          label: "Entity Type",
          type: "select",
          options: [
            { value: "corporation", label: "Corporation" },
            { value: "general_partnership", label: "General Partnership" },
            { value: "llc", label: "Limited Liability Company" },
            { value: "limited_partnership", label: "Limited Partnership" },
            { value: "s_corporation", label: "S-Corporation" },
            { value: "sole_proprietorship", label: "Sole Proprietorship" },
          ],
          helpText: "If holding title as a Trust or Retirement Entity, pick the closest structure or skip.",
          optional: true,
        },
        { name: "entityName", label: "Entity / Trust / Retirement Account Name", type: "text" },
        { name: "entityDateOfFormation", label: "Date of Formation", type: "date", optional: true },
        { name: "entityStateOfFormation", label: "State of Formation", type: "text", optional: true },
        { name: "entityFederalTaxId", label: "Entity Federal Tax ID", type: "text", optional: true },
        { name: "entityStreet", label: "Entity Street Address", type: "text", optional: true },
        { name: "entityUnit", label: "Entity Street Unit/Suite", type: "text", optional: true },
        { name: "entityCity", label: "Entity City", type: "text", optional: true },
        { name: "entityState", label: "Entity State", type: "text", optional: true },
        { name: "entityZip", label: "Entity Zip", type: "text", optional: true },
      ],
    },
    {
      title: "Borrower Information",
      fields: [
        { name: "borrowerLegalFirstName", label: "Borrower Legal First Name", type: "text" },
        { name: "borrowerLegalMiddleName", label: "Borrower Legal Middle Name", type: "text", optional: true },
        { name: "borrowerLegalLastName", label: "Borrower Legal Last Name", type: "text" },
        {
          name: "borrowerSuffix",
          label: "Borrower Suffix",
          type: "select",
          optional: true,
          options: [
            { value: "jr", label: "Jr" },
            { value: "sr", label: "Sr" },
            { value: "ii", label: "II" },
            { value: "iii", label: "III" },
            { value: "iv", label: "IV" },
          ],
        },
        { name: "borrowerCellPhone", label: "Borrower Cell Phone", type: "tel" },
        { name: "borrowerEmail", label: "Borrower Email Address", type: "email" },
        {
          name: "borrowerSsnItin",
          label: "Borrower SSN/ITIN",
          type: "text",
          helpText: "Sensitive — stored the same as everything else on this deal, but handle with care when sharing.",
        },
        { name: "isItin", label: "Is this an ITIN?", type: "yesno", options: YES_NO },
        {
          name: "estimatedCreditScoreRange",
          label: "Borrower Estimated Credit Score Range",
          type: "select",
          options: [
            { value: "740_plus", label: "740+" },
            { value: "720_739", label: "720-739" },
            { value: "700_719", label: "700-719" },
            { value: "680_699", label: "680-699" },
            { value: "660_679", label: "660-679" },
            { value: "640_659", label: "640-659" },
            { value: "620_639", label: "620-639" },
            { value: "below_620", label: "Below 620" },
          ],
        },
        { name: "borrowerDateOfBirth", label: "Borrower Date of Birth", type: "date" },
        {
          name: "maritalStatus",
          label: "Borrower Marital Status",
          type: "select",
          options: [
            { value: "married", label: "Married" },
            { value: "separated", label: "Separated" },
            { value: "unmarried", label: "Unmarried" },
          ],
        },
        {
          name: "servedInArmedForces",
          label: "Are you currently serving, or previously served, in the United States Armed Forces?",
          type: "yesno",
          options: YES_NO,
        },
        {
          name: "citizenship",
          label: "Citizenship",
          type: "select",
          options: [
            { value: "us_citizen", label: "U.S. Citizen" },
            { value: "permanent_resident", label: "Permanent Resident" },
            { value: "non_resident", label: "Non-Resident" },
            { value: "foreign_national", label: "Foreign National" },
          ],
        },
      ],
    },
    {
      title: "Primary Address",
      fields: [
        { name: "primaryAddressStreet", label: "Primary Address Street", type: "text" },
        { name: "primaryAddressUnit", label: "Primary Address Unit #", type: "text", optional: true },
        { name: "primaryAddressCity", label: "Primary Address City", type: "text" },
        { name: "primaryAddressState", label: "Primary Address State", type: "text" },
        { name: "primaryAddressZip", label: "Primary Address Zip Code", type: "text" },
        { name: "primaryAddressCountry", label: "Primary Address Country", type: "text" },
        { name: "yearsAtPrimaryAddress", label: "# of Years at Primary Address", type: "number" },
        { name: "monthsAtPrimaryAddress", label: "# of Months at Primary Address", type: "number" },
        {
          name: "currentLivingSituation",
          label: "What is your current living situation?",
          type: "select",
          options: [
            { value: "own", label: "Own" },
            { value: "rent", label: "Rent" },
            { value: "rent_free", label: "Rent-free" },
          ],
        },
        {
          name: "mailingSameAsPrimary",
          label: "Is your mailing address the same as your primary address?",
          type: "yesno",
          options: YES_NO,
        },
        {
          name: "mailingAddressStreet",
          label: "Mailing Address",
          type: "text",
          showIf: { field: "mailingSameAsPrimary", equals: "no" },
        },
        {
          name: "mailingAddressUnit",
          label: "Mailing Address Unit #",
          type: "text",
          optional: true,
          showIf: { field: "mailingSameAsPrimary", equals: "no" },
        },
        {
          name: "mailingAddressCity",
          label: "Mailing Address City",
          type: "text",
          showIf: { field: "mailingSameAsPrimary", equals: "no" },
        },
        {
          name: "mailingAddressState",
          label: "Mailing Address State",
          type: "text",
          showIf: { field: "mailingSameAsPrimary", equals: "no" },
        },
        {
          name: "mailingAddressZip",
          label: "Mailing Address Zip Code",
          type: "text",
          showIf: { field: "mailingSameAsPrimary", equals: "no" },
        },
        {
          name: "mailingAddressCountry",
          label: "Mailing Address Country",
          type: "text",
          showIf: { field: "mailingSameAsPrimary", equals: "no" },
        },
      ],
    },
    {
      title: "Employment",
      fields: [
        {
          name: "currentEmploymentStatus",
          label: "Current employment status",
          type: "select",
          options: [
            { value: "employed", label: "Employed" },
            { value: "no_longer_employed", label: "No longer employed" },
          ],
        },
        { name: "employerOrBusinessName", label: "What is your employer or business name?", type: "text" },
        { name: "positionOrTitle", label: "What is your position or title?", type: "text" },
        { name: "employerPhoneNumber", label: "Employer Phone Number", type: "tel" },
        { name: "employerStreetAddress", label: "Employer Street Address", type: "text" },
        { name: "employerCity", label: "Employer City", type: "text" },
        { name: "employerState", label: "Employer State", type: "text" },
        { name: "employerZip", label: "Employer Zip", type: "text" },
        {
          name: "isBusinessOwnerOrSelfEmployed",
          label: "Are you a business owner or self-employed?",
          type: "yesno",
          options: YES_NO,
        },
        { name: "monthlyIncome", label: "Monthly Income", type: "currency" },
        { name: "estimatedLiquidAssets", label: "Estimated Total Available Liquid Assets", type: "currency" },
      ],
    },
    {
      title: "Background",
      fields: [
        { name: "declaredBankruptPast7Years", label: "Have you been declared bankrupt within the past 7 years?", type: "yesno", options: YES_NO },
        { name: "declaredBankruptExplanation", label: "If 'yes', please provide an explanation", type: "text", optional: true, showIf: { field: "declaredBankruptPast7Years", equals: "yes" } },
        { name: "activeLawsuits", label: "Do you have any active lawsuits against you?", type: "yesno", options: YES_NO },
        { name: "activeLawsuitsExplanation", label: "If 'yes', please provide an explanation", type: "text", optional: true, showIf: { field: "activeLawsuits", equals: "yes" } },
        {
          name: "obligatedForeclosureDeedJudgment",
          label:
            "Have you directly or indirectly been obligated on any loan which resulted in foreclosure, transfer of title in lieu of foreclosure, or judgement?",
          type: "yesno",
          options: YES_NO,
        },
        { name: "obligatedForeclosureDeedJudgmentExplanation", label: "If 'yes', please provide an explanation", type: "text", optional: true, showIf: { field: "obligatedForeclosureDeedJudgment", equals: "yes" } },
        { name: "convictedFelonyFraud", label: "Have you ever been convicted of a felony or other fraud related crimes?", type: "yesno", options: YES_NO },
        { name: "convictedFelonyFraudExplanation", label: "If 'yes', please provide an explanation", type: "text", optional: true, showIf: { field: "convictedFelonyFraud", equals: "yes" } },
        { name: "outstandingJudgments", label: "Are there any outstanding judgments against you?", type: "yesno", options: YES_NO },
        { name: "outstandingJudgmentsExplanation", label: "If 'yes', please provide an explanation", type: "text", optional: true, showIf: { field: "outstandingJudgments", equals: "yes" } },
        { name: "propertyTaxLiens", label: "Have you had or currently have any property tax liens?", type: "yesno", options: YES_NO },
        { name: "propertyTaxLiensExplanation", label: "If 'yes', please provide an explanation", type: "text", optional: true, showIf: { field: "propertyTaxLiens", equals: "yes" } },
        {
          name: "delinquentDefaultFederalDebt",
          label:
            "Are you presently delinquent or in any default on any Federal debt or any other loan, mortgage, financial obligation, bond, or loan guarantee?",
          type: "yesno",
          options: YES_NO,
        },
        { name: "delinquentDefaultFederalDebtExplanation", label: "If 'yes', please provide an explanation", type: "text", optional: true, showIf: { field: "delinquentDefaultFederalDebt", equals: "yes" } },
      ],
    },
    {
      title: "Subject Property & Collateral",
      fields: [
        { name: "propertyStreet", label: "Property Street Address", type: "text" },
        { name: "propertyUnit", label: "Property Unit #", type: "text", optional: true },
        { name: "propertyCity", label: "Property City", type: "text" },
        { name: "propertyState", label: "Property State", type: "text" },
        { name: "propertyZip", label: "Property Zip Code", type: "text" },
        { name: "propertyCounty", label: "Property County", type: "text" },
        { name: "apnParcelNumber", label: "APN / Parcel Number", type: "text", optional: true },
        {
          name: "existingPropertyType",
          label: "Existing Property Type",
          type: "select",
          options: [
            { value: "single_family_residence", label: "Single-Family Residence" },
            { value: "2_4_units", label: "2-4 Units" },
            { value: "condo", label: "Condo" },
            { value: "land", label: "Land" },
          ],
        },
        {
          name: "numberOfUnits",
          label: "Number of Units",
          type: "select",
          options: [
            { value: "1", label: "1" },
            { value: "2", label: "2" },
            { value: "3", label: "3" },
            { value: "4", label: "4" },
          ],
        },
        { name: "isAdu", label: "Is there an ADU?", type: "yesno", options: YES_NO },
        {
          name: "attachedOrDetached",
          label: "Is Subject Property Attached or Detached to another property?",
          type: "select",
          options: [
            { value: "attached", label: "Attached" },
            { value: "detached", label: "Detached" },
          ],
        },
        { name: "allocatedLoanAmount", label: "Allocated Loan Amount", type: "currency", syncDealField: "loanAmountRequested" },
        { name: "acquisitionPrice", label: "Acquisition Price", type: "currency", syncDealField: "purchasePrice" },
        { name: "estimatedAsIsValue", label: "Estimated As-Is Value", type: "currency", syncDealField: "estimatedAsIsValue" },
        { name: "lienPayoffAmount", label: "Lien Payoff Amount", type: "currency", optional: true },
      ],
    },
    {
      title: "Rental Income & Expenses (Collateral)",
      fields: [
        { name: "totalEstimatedRents", label: "Total Estimated Rents", type: "currency", syncDealField: "currentRent" },
        { name: "annualHazardInsurance", label: "Annual Hazard Insurance", type: "currency" },
        { name: "annualFloodInsurance", label: "Annual Flood Insurance", type: "currency", optional: true },
        { name: "annualPropertyTax", label: "Annual Property Tax", type: "currency", syncDealField: "annualTaxes" },
        { name: "monthlyHoaFees", label: "Monthly HOA Fees", type: "currency", optional: true },
      ],
    },
    {
      title: "HOA",
      fields: [
        { name: "isThereHoa", label: "Is there an HOA?", type: "yesno", options: YES_NO },
        { name: "hoaCompanyName", label: "HOA Company Name", type: "text", optional: true, showIf: { field: "isThereHoa", equals: "yes" } },
        { name: "hoaMonthlyDues", label: "Monthly HOA Dues", type: "currency", optional: true, showIf: { field: "isThereHoa", equals: "yes" } },
        { name: "hoaContactName", label: "HOA Contact Name", type: "text", optional: true, showIf: { field: "isThereHoa", equals: "yes" } },
        { name: "hoaPhoneNumber", label: "HOA Phone Number", type: "tel", optional: true, showIf: { field: "isThereHoa", equals: "yes" } },
        { name: "hoaEmail", label: "HOA Email", type: "email", optional: true, showIf: { field: "isThereHoa", equals: "yes" } },
      ],
    },
    {
      title: "Loan Terms",
      fields: [
        { name: "desiredClosingDate", label: "Desired Closing Date", type: "date" },
        { name: "hasInvestmentPropertyExperience", label: "Do you have investment property experience?", type: "yesno", options: YES_NO },
        { name: "numInvestmentProperties36mo", label: "# of investment properties owned or sold in the last 36 months?", type: "number" },
        {
          name: "rateType",
          label: "Rate Type",
          type: "select",
          options: [
            { value: "30_year_fixed", label: "30 Year Fixed" },
            { value: "5_6_arm", label: "5/6 ARM" },
          ],
        },
      ],
    },
    {
      title: "Subject Property Income and Expenses",
      fields: [
        { name: "monthlyRentalIncome", label: "Monthly Rental Income", type: "currency" },
        {
          name: "rentalIncomeSource",
          label: "Rental Income Source",
          type: "select",
          options: [
            { value: "lease", label: "Lease" },
            { value: "market_rents", label: "Market Rents" },
          ],
        },
        { name: "annualPropertyTaxesAmount", label: "Annual Property Taxes $ Amount", type: "currency" },
        { name: "annualInsuranceAndFloodAmount", label: "Annual Insurance and Flood $ Amount", type: "currency" },
      ],
    },
    {
      title: "Escrow/Title & Hazard Insurance",
      fields: [
        { name: "titleContactName", label: "Escrow/Title Contact Name", type: "text", syncDealField: "titleCompanyAgentName" },
        { name: "titleCompanyName", label: "Escrow/Title Company Name", type: "text", syncDealField: "titleCompanyName" },
        { name: "titleEmail", label: "Escrow/Title Email", type: "email", syncDealField: "titleAgentEmail" },
        { name: "titlePhone", label: "Escrow/Title Phone", type: "tel", syncDealField: "titleAgentPhone" },
        { name: "hazardInsuranceRepName", label: "Hazard Insurance Rep Name", type: "text", syncDealField: "insuranceAgentName" },
        { name: "hazardInsuranceCompanyName", label: "Hazard Insurance Company Name", type: "text", syncDealField: "insuranceAgency" },
        { name: "hazardInsuranceRepEmail", label: "Hazard Insurance Rep Email", type: "email", syncDealField: "insuranceAgentEmail" },
        { name: "hazardInsurancePhone", label: "Hazard Insurance Phone", type: "tel", syncDealField: "insuranceAgentPhone" },
        { name: "hazardInsuranceNotes", label: "Hazard Insurance Notes", type: "text", optional: true, syncDealField: "insuranceContactNotes" },
      ],
    },
    {
      title: "Interior Access",
      fields: [
        {
          name: "interiorAccessContactRelationship",
          label: "Interior Access Contact Relationship",
          type: "select",
          syncDealField: "interiorAccessContactRelationship",
          options: [
            { value: "borrower", label: "Borrower" },
            { value: "property_manager", label: "Property Manager" },
            { value: "real_estate_agent", label: "Real Estate Agent" },
            { value: "seller", label: "Seller" },
            { value: "tenant", label: "Tenant" },
            { value: "other", label: "Other" },
          ],
        },
        { name: "interiorAccessContactName", label: "Interior Access Contact Name", type: "text", syncDealField: "interiorAccessContactName" },
        { name: "interiorAccessContactEmail", label: "Interior Access Contact Email", type: "email", syncDealField: "interiorAccessContactEmail" },
        { name: "interiorAccessContactPhone", label: "Interior Access Contact Phone", type: "tel", syncDealField: "interiorAccessContactPhone" },
        { name: "lockBoxInfo", label: "Lock Box Info", type: "text", optional: true, syncDealField: "interiorAccessLockBoxInfo" },
      ],
    },
  ],
};
