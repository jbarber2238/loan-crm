import { relations, sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const baseRoleEnum = pgEnum("base_role", [
  "loan_officer",
  "loan_officer_assistant",
  "processor",
]);

export const loanCategoryEnum = pgEnum("loan_category", [
  "dscr_purchase",
  "dscr_cash_out_refinance",
  "dscr_rate_term_refinance",
  "fix_and_flip",
  "bridge_purchase",
  "bridge_refinance",
  "new_construction",
  "portfolio",
]);

export const propertyTypeEnum = pgEnum("property_type", [
  "single_family",
  "condo",
  "townhome",
  "duplex",
  "triplex",
  "fourplex",
  "multifamily_5plus",
  "mixed_use",
]);

export const exitStrategyEnum = pgEnum("exit_strategy", [
  "refinance",
  "fix_and_sell",
  "fix_and_hold",
  "purchase_and_hold",
  "build_and_sell",
]);

export const rentalStrategyEnum = pgEnum("rental_strategy", [
  "long_term",
  "mid_term",
  "short_term",
  "coliving",
]);

export const occupancyStatusEnum = pgEnum("occupancy_status", ["vacant", "tenant_occupied"]);

export const maritalStatusEnum = pgEnum("marital_status", ["married", "unmarried", "separated"]);

export const citizenshipStatusEnum = pgEnum("citizenship_status", [
  "us_citizen",
  "permanent_resident_alien",
  "non_permanent_resident_alien",
  "foreign_national",
  "itin",
]);

// Commercial property types Justin's lenders won't take on a portfolio loan
// (he doesn't finance office/retail/industrial/land at all, so those aren't
// options anywhere in the app).
export const COMMERCIAL_PROPERTY_TYPES = ["multifamily_5plus", "mixed_use"] as const;

// "pricing_request" templates are used by the app itself (rendered and sent
// when pricing a deal) — their key/category are fixed, only content is
// editable. "borrower_lifecycle" templates are ones Justin defines himself
// for future automated sends to the borrower at a given pipeline stage.
export const emailTemplateCategoryEnum = pgEnum("email_template_category", [
  "pricing_request",
  "borrower_lifecycle",
]);

export const dealStageEnum = pgEnum("deal_stage", [
  "new",
  "rate_shopping",
  "term_sheet",
  "negotiation",
  "application",
  "processing",
  "conditional_approval",
  "clear_to_close",
  "closed",
  "on_hold",
  "lost",
  "follow_up",
  "disqualified",
]);

// A need's status is derived from its documents (see dealClientNeedDocuments) rather than a
// single manual toggle: not_sent (never sent to the borrower), awaiting_docs
// (sent, no document pending review — including a need whose last document
// was rejected), review_needed (a document is attached and pending
// approve/disapprove), accepted (an approved document is on file). esign/
// questionnaire needs (no document to approve) still use this same enum,
// just skipping review_needed.
export const dealClientNeedStatusEnum = pgEnum("deal_client_need_status", [
  "not_sent",
  "awaiting_docs",
  "review_needed",
  "accepted",
]);

export const clientNeedDocumentReviewStatusEnum = pgEnum("client_need_document_review_status", [
  "pending",
  "approved",
  "rejected",
]);

export const clientNeedTemplateTypeEnum = pgEnum("client_need_template_type", [
  "document_upload",
  "esign",
  "questionnaire",
  // A plain external link the borrower just needs to click through (e.g. a
  // lender's appraisal-fee payment page) — no file, no answer to capture,
  // just a URL. Completion is manual (processor marks it accepted), same as esign.
  "link",
  // A lender's own application PDF (or any other fillable PDF), rendered and
  // signed through PandaDoc rather than our own upload flow — the borrower
  // fills/signs it there, and the completed PDF comes back into this need's
  // documents automatically via webhook once done.
  "pandadoc_form",
]);

export const conditionStatusEnum = pgEnum("condition_status", ["open", "cleared"]);

// "title"/"insurance" conditions are simple checklist items (someone else's
// responsibility, we're just tracking status); "borrower" conditions are
// ours to collect from the borrower and can be promoted into a client need;
// "other" is anything the AI extractor couldn't confidently place.
export const conditionCategoryEnum = pgEnum("condition_category", ["title", "insurance", "borrower", "other"]);

export const noteSourceEnum = pgEnum("note_source", ["user", "ai", "system"]);

export const pricingRequestStatusEnum = pgEnum("pricing_request_status", [
  "draft",
  "sent",
]);

export const termSheetStatusEnum = pgEnum("term_sheet_status", [
  "draft",
  "generated",
  "accepted",
]);

// ---------------------------------------------------------------------------
// Auth.js tables (also our domain `users` table — extra columns added below)
// ---------------------------------------------------------------------------

export const users = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),

  // Domain fields (spec §5 `users`)
  googleId: text("google_id"),
  baseRole: baseRoleEnum("base_role").notNull().default("loan_officer"),
  isAdmin: boolean("is_admin").notNull().default(false),
  assignedLoanOfficerIds: uuid("assigned_loan_officer_ids").array(),
  active: boolean("active").notNull().default(true),
  schedulingLink: text("scheduling_link"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// Singleton row (id is always "default") — company-wide settings editable
// from Settings → Company.
export const companySettings = pgTable("company_settings", {
  id: text("id").primaryKey().default("default"),
  name: text("name").notNull(),
  // A shareable link to Justin's DSCR PITI calculator tool — included as a
  // P.S. in the DSCR "term sheet ready" borrower email. Null until he adds one.
  dscrCalculatorLink: text("dscr_calculator_link"),
  // PandaDoc integration (Settings → Integrations) — the API key for
  // creating/sending documents, and the shared key PandaDoc issues when the
  // webhook subscription pointing at /api/webhooks/pandadoc is created,
  // used to verify those webhook deliveries are genuinely from PandaDoc.
  pandadocApiKey: text("pandadoc_api_key"),
  pandadocWebhookSharedKey: text("pandadoc_webhook_shared_key"),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "account",
  {
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ]
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
);

// ---------------------------------------------------------------------------
// Lenders / products / criteria / client-need templates
// ---------------------------------------------------------------------------

export const lenders = pgTable("lenders", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const lenderReps = pgTable("lender_reps", {
  id: uuid("id").primaryKey().defaultRandom(),
  lenderId: uuid("lender_id")
    .notNull()
    .references(() => lenders.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
});

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  lenderId: uuid("lender_id")
    .notNull()
    .references(() => lenders.id, { onDelete: "cascade" }),
  category: loanCategoryEnum("category").notNull(),
  name: text("name").notNull(),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const lenderCriteria = pgTable("lender_criteria", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  minDscr: numeric("min_dscr"),
  maxLtv: numeric("max_ltv"),
  minFico: integer("min_fico"),
  minLoanAmount: numeric("min_loan_amount"),
  maxLoanAmount: numeric("max_loan_amount"),
  statesAllowed: text("states_allowed").array(),
  propertyTypesAllowed: text("property_types_allowed").array(),
  otherNotes: text("other_notes"),
});

// The shared client-need catalog — every "kind" of borrower ask (Bank
// Statements, Gift Letter, etc.) lives here exactly once, standard or
// custom, and gets attached to whichever products need it via
// productClientNeeds. Editing one here updates it everywhere it's used.
export const clientNeeds = pgTable("client_needs", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemName: text("item_name").notNull(),
  description: text("description"),
  // Grouping for the catalog browser (Financials, Borrower Experience,
  // etc.) — freeform-ish but driven from CLIENT_NEED_CATEGORIES in
  // src/lib/labels.ts so the picker stays tidy. Null/unrecognized falls
  // into an "Other" bucket in the UI rather than being hidden.
  category: text("category"),
  needType: clientNeedTemplateTypeEnum("need_type").notNull().default("document_upload"),
  // esign: which e-sign vendor this will come through (free text for now — no
  // API integration yet, just tells the borrower what to watch for).
  esignVendor: text("esign_vendor"),
  // link: the URL the borrower needs to click through (e.g. an appraisal-fee
  // payment page a lender sent us).
  linkUrl: text("link_url"),
  // pandadoc_form: the PandaDoc template to create/send from — set up once
  // per lender's application PDF in PandaDoc's own editor, then referenced
  // here by its template_uuid.
  pandadocTemplateUuid: text("pandadoc_template_uuid"),
  // document_upload: an optional blank/fillable file (e.g. a lender
  // application PDF) the borrower downloads, fills in, and re-uploads.
  templateFileName: text("template_file_name"),
  templateFileMimeType: text("template_file_mime_type"),
  templateFileData: text("template_file_data"),
  templateFileSize: integer("template_file_size"),
  // document_upload: how many files this need requires before it can be
  // considered accepted (e.g. 2 for a driver's license — front and back).
  // Copied onto dealClientNeeds when the need is added to a deal.
  minFiles: integer("min_files").notNull().default(1),
  // Standard = curated by us, shown as such in the picker. Custom = added
  // ad hoc by a processor while building out a product's checklist (or from
  // a live deal) — still fully reusable afterward, just flagged as such.
  isCustom: boolean("is_custom").notNull().default(false),
  // Client-need generation is three layers, broad to narrow: every loan →
  // every loan of a given category → this specific lender's product.
  // isGlobal = true is the first, broadest layer (e.g. Driver's License,
  // Operating Agreement — every loan needs these regardless of type or
  // lender). categoryClientNeeds below is the second layer; productClientNeeds
  // is the third and narrowest. "Auto Generate" unions all three that apply.
  isGlobal: boolean("is_global").notNull().default(false),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// questionnaire-type needs: the set of custom questions the borrower
// answers directly instead of uploading a file.
export const clientNeedQuestions = pgTable("client_need_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientNeedId: uuid("client_need_id")
    .notNull()
    .references(() => clientNeeds.id, { onDelete: "cascade" }),
  questionText: text("question_text").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

// The second layer — a catalog item required for every loan of a given
// category, regardless of lender (e.g. every DSCR Purchase). Deliberately
// separate from productClientNeeds (lender-specific, the third/narrowest
// layer) so a category-wide requirement doesn't have to be re-attached to
// every lender's product one by one.
export const categoryClientNeeds = pgTable("category_client_needs", {
  id: uuid("id").primaryKey().defaultRandom(),
  category: loanCategoryEnum("category").notNull(),
  clientNeedId: uuid("client_need_id")
    .notNull()
    .references(() => clientNeeds.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Which catalog items are on a given product's checklist, and in what order.
export const productClientNeeds = pgTable("product_client_needs", {
  id: uuid("id").primaryKey().defaultRandom(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  clientNeedId: uuid("client_need_id")
    .notNull()
    .references(() => clientNeeds.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Lender-provided reference documents (rate matrices, guideline sheets, etc.).
// Stored as base64 in Postgres — no extra object-storage credentials needed.
// A doc with a null productId applies to the whole lender (e.g. a matrix
// spreadsheet covering every program); a doc tied to a productId is specific
// to that category.
export const lenderDocuments = pgTable("lender_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Null lenderId = a master/global document that applies to every lender
  // and product (e.g. the org-wide lender matrix spreadsheet).
  lenderId: uuid("lender_id").references(() => lenders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  data: text("data").notNull(), // base64
  uploadedBy: uuid("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Deals
// ---------------------------------------------------------------------------

export const deals = pgTable("deals", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Human-readable, sequential — the UUID `id` above is for joins/URLs, this
  // is what staff say out loud and search by. Backed by a DB sequence
  // (deals_loan_number_seq, starting at 1000) so it's assigned automatically
  // on insert.
  loanNumber: integer("loan_number")
    .notNull()
    .unique()
    .default(sql`nextval('deals_loan_number_seq')`),
  borrowerName: text("borrower_name").notNull(),
  borrowerEntityName: text("borrower_entity_name"),
  borrowerPhone: text("borrower_phone"),
  borrowerEmail: text("borrower_email"),
  // Unguessable token driving the public, unauthenticated
  // /borrower-upload/[token] page — generated lazily on first request, not
  // at deal creation. One token per deal covers every outstanding need;
  // that page can only ever upload, never list/view/download a file.
  borrowerUploadToken: text("borrower_upload_token").unique(),
  // Discrete, independently-editable fields — a processor may gather these
  // over the phone and never touch the matching client need, or the client
  // need may get deleted after collecting them, or the contact may change
  // mid-deal. "Mark Accepted" on the Title Info / Insurance Contact Info
  // client need auto-fills these once; after that they're just plain deal
  // fields, editable any time from the Roles tab regardless of the need.
  titleCompanyAgentName: text("title_company_agent_name"),
  titleAgentEmail: text("title_agent_email"),
  titleAgentPhone: text("title_agent_phone"),
  insuranceAgency: text("insurance_agency"),
  insuranceAgentName: text("insurance_agent_name"),
  insuranceAgentEmail: text("insurance_agent_email"),
  insuranceAgentPhone: text("insurance_agent_phone"),
  propertyAddress: text("property_address").notNull(),
  // Set instead of a street address for new construction when the borrower
  // only has the county's Assessor's Parcel Number (no address assigned yet).
  parcelId: text("parcel_id"),
  loanCategory: loanCategoryEnum("loan_category").notNull(),
  loanAmountRequested: numeric("loan_amount_requested").notNull(),
  purchasePrice: numeric("purchase_price"),
  assignedLoanOfficerId: uuid("assigned_loan_officer_id")
    .notNull()
    .references(() => users.id),
  assignedProcessorId: uuid("assigned_processor_id").references(() => users.id),
  assignedAssistantId: uuid("assigned_assistant_id").references(() => users.id),
  stage: dealStageEnum("stage").notNull().default("new"),
  source: text("source"),
  // A standing note the LO can jot down for lender reps — unique
  // situations, things to flag up front — included on new pricing emails.
  pricingNoteToRep: text("pricing_note_to_rep"),
  lenderId: uuid("lender_id").references(() => lenders.id),
  productId: uuid("product_id").references(() => products.id),
  finalRate: numeric("final_rate"),
  finalTerms: text("final_terms"),
  // Mortgage type/amortization shown on the accepted-terms header (e.g.
  // "30 Year Fixed", "5/6 ARM") — copied from the accepted term sheet's
  // amortizationType field, editable afterward like the other final terms.
  finalAmortizationType: text("final_amortization_type"),
  // Loan term in years, copied from the accepted term sheet — needed to
  // estimate a fully-amortizing PITIA payment (see term-sheet-calculations.ts).
  finalLoanTermYears: integer("final_loan_term_years"),
  // The accepted loan amount can shift after acceptance (appraisal,
  // underwriting) — distinct from the borrower's original ask.
  approvedLoanAmount: numeric("approved_loan_amount"),
  // The negotiated/approved LTV — editable post-acceptance (a lender may
  // require it to drop after appraisal/DSCR review), and drives
  // approvedLoanAmount = approvedLtv% × the active value basis below.
  approvedLtv: numeric("approved_ltv"),
  appraisedValue: numeric("appraised_value"),
  // true = LTV/loan amount are based on purchase price (the default — most
  // lenders anchor to the lower of purchase price/appraised value); false =
  // based on appraisedValue once it's in.
  ltvBasedOnPurchasePrice: boolean("ltv_based_on_purchase_price").notNull().default(true),
  // Lender points / rate buydown fee on the accepted terms — separate from
  // our own origination fee and processing fee.
  costToBorrowerFee: numeric("cost_to_borrower_fee"),
  // Null = use the standard $999 (STANDARD_PROCESSING_FEE) — only set this
  // when the borrower actually negotiated something different.
  processingFeeOverride: numeric("processing_fee_override"),
  // Rate lock timing varies by lender (some lock at application, some only
  // after appraisal) — this is a plain manual toggle, not tied to a stage.
  rateLocked: boolean("rate_locked").notNull().default(false),
  rateLockedAt: timestamp("rate_locked_at", { mode: "date" }),
  appraisalOrderedDate: timestamp("appraisal_ordered_date", { mode: "date" }),
  creditPullDate: timestamp("credit_pull_date", { mode: "date" }),
  insuranceContactedDate: timestamp("insurance_contacted_date", { mode: "date" }),
  titleOrderedDate: timestamp("title_ordered_date", { mode: "date" }),
  clientNeedsRemindersPaused: boolean("client_needs_reminders_paused")
    .notNull()
    .default(false),
  // How often the (not-yet-built) automated client-needs reminder should
  // re-send while items are outstanding. 24/48/72/168 (weekly) hours.
  clientNeedsReminderIntervalHours: integer("client_needs_reminder_interval_hours")
    .notNull()
    .default(24),
  driveLink: text("drive_link"),

  // On Hold / Follow-up are themselves stage values, so this is the only
  // record of which "real" pipeline stage to resume to (and to dim the
  // progress stepper at) once the deal comes off pause. Cleared whenever the
  // deal leaves on_hold/follow_up for any reason.
  pausedFromStage: dealStageEnum("paused_from_stage"),
  pauseReason: text("pause_reason"),
  // When the current on_hold/follow_up period started — drives the 7-day
  // Follow-up → Lost auto-expiry.
  pausedAt: timestamp("paused_at", { mode: "date" }),
  // Permanent, discrete reasons (not folded into the general notes feed) so
  // they're easy to pull into an aggregate "why do we lose/disqualify deals"
  // report later.
  lostReason: text("lost_reason"),
  disqualifiedReason: text("disqualified_reason"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),

  // Intake form fields (§ dynamic loan intake form)
  estimatedFico: integer("estimated_fico"),
  propertyType: propertyTypeEnum("property_type"),
  unitCount: integer("unit_count"),
  exitStrategy: exitStrategyEnum("exit_strategy"),
  numFlips: integer("num_flips"),
  numRentals: integer("num_rentals"),
  numNewConstruction: integer("num_new_construction"),
  // Shared by the Fix & Flip "already own this property?" branch (delayed-
  // purchase lender programs) and the New Construction "already own the
  // land?" branch — same underlying question, different label per category.
  propertyAlreadyOwned: boolean("property_already_owned"),
  propertyPurchaseDate: timestamp("property_purchase_date", { mode: "date" }),
  estimatedRehabCost: numeric("estimated_rehab_cost"),
  rehabDescription: text("rehab_description"),
  estimatedArv: numeric("estimated_arv"),
  estimatedAsIsValue: numeric("estimated_as_is_value"),
  estimatedAsIsLotValue: numeric("estimated_as_is_lot_value"),
  mortgagePayoffAmount: numeric("mortgage_payoff_amount"),
  propertyListedOnMarket: boolean("property_listed_on_market"),
  currentMonthlyMortgagePayment: numeric("current_monthly_mortgage_payment"),
  currentRent: numeric("current_rent"),
  annualTaxes: numeric("annual_taxes"),
  annualInsurance: numeric("annual_insurance"),
  annualHoa: numeric("annual_hoa"),
  capitalPartner: boolean("capital_partner"),
  rentalStrategy: rentalStrategyEnum("rental_strategy"),
  currentOccupancy: occupancyStatusEnum("current_occupancy"),
  estimatedClosingDate: timestamp("estimated_closing_date", { mode: "date" }),
  rural: boolean("rural"),
  maritalStatus: maritalStatusEnum("marital_status"),
  citizenship: citizenshipStatusEnum("citizenship"),
  mortgageLatesLast12mo: boolean("mortgage_lates_last_12mo"),
  taxLiensBkForeclosureLast24mo: boolean("tax_liens_bk_foreclosure_last_24mo"),
  borrowerLiquidity: numeric("borrower_liquidity"),
  marketingConsent: boolean("marketing_consent"),

  // Manually-triggered AI assessments (button click, never automatic) — each
  // stores its own result blob plus when it last ran, so the section can show
  // stale results with their timestamp instead of re-running on every visit.
  aiValueAssessment: jsonb("ai_value_assessment").$type<{
    low: number | null;
    median: number | null;
    high: number | null;
    note: string | null;
    ranAt: string;
  }>(),
  aiLenderMatch: jsonb("ai_lender_match").$type<{
    dealFlags: string[];
    matches: {
      lenderName: string;
      productName: string;
      fit: "strong" | "close" | "poor";
      reason: string;
    }[];
    ranAt: string;
  }>(),
});

export const dealPortfolioProperties = pgTable("deal_portfolio_properties", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  streetAddress: text("street_address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  postalCode: text("postal_code").notNull(),
  propertyType: propertyTypeEnum("property_type").notNull(),
  purchasePrice: numeric("purchase_price"),
  estimatedAsIsValue: numeric("estimated_as_is_value"),
  currentRent: numeric("current_rent"),
  annualTaxes: numeric("annual_taxes"),
  annualInsurance: numeric("annual_insurance"),
  annualHoa: numeric("annual_hoa"),
  rentalStrategy: rentalStrategyEnum("rental_strategy"),
  currentOccupancy: occupancyStatusEnum("current_occupancy"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const dealStageHistory = pgTable("deal_stage_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  stage: dealStageEnum("stage").notNull(),
  // Nullable so the automated 7-day Follow-up → Lost sweep (no logged-in
  // user to attribute it to) can still log a history row.
  changedByUserId: uuid("changed_by_user_id").references(() => users.id),
  changedAt: timestamp("changed_at", { mode: "date" }).notNull().defaultNow(),
});

export const dealClientNeeds = pgTable("deal_client_needs", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  itemName: text("item_name").notNull(),
  description: text("description"),
  status: dealClientNeedStatusEnum("status").notNull().default("not_sent"),
  // Copied from the catalog item at add-time (or set directly for a custom
  // need) — document_upload needs go through the document review pipeline
  // below; esign/questionnaire needs have no document to approve, so they
  // stay on manual needed/accepted-style toggles.
  needType: clientNeedTemplateTypeEnum("need_type").notNull().default("document_upload"),
  // Copied from the catalog item at add-time — how many documents this need
  // requires before recomputeNeedStatus() will call it accepted.
  minFiles: integer("min_files").notNull().default(1),
  // Copied from the catalog item at add-time (or set directly for a custom
  // need) — same fields/meaning as on clientNeeds above.
  linkUrl: text("link_url"),
  templateFileName: text("template_file_name"),
  templateFileMimeType: text("template_file_mime_type"),
  templateFileData: text("template_file_data"),
  templateFileSize: integer("template_file_size"),
  // pandadoc_form: the template to create/send from (copied from the
  // catalog item), the resulting document's id once created, and PandaDoc's
  // own status string for that document (mirrored here mostly for
  // debugging/traceability — recomputeNeedStatus derives the real `status`
  // column above from webhook events, this is just what PandaDoc last said).
  pandadocTemplateUuid: text("pandadoc_template_uuid"),
  pandadocDocumentId: text("pandadoc_document_id"),
  pandadocStatus: text("pandadoc_status"),
  sentAt: timestamp("sent_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const dealClientNeedDocuments = pgTable("deal_client_need_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientNeedId: uuid("client_need_id")
    .notNull()
    .references(() => dealClientNeeds.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  data: text("data").notNull(), // base64 — same pattern as lenderDocuments.data
  uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id),
  reviewStatus: clientNeedDocumentReviewStatusEnum("review_status").notNull().default("pending"),
  reviewedAt: timestamp("reviewed_at", { mode: "date" }),
  reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id),
  rejectionNote: text("rejection_note"),
  // Manually-triggered AI document review (§ Client Needs Overhaul plan) —
  // {"flags": [{"page": number|null, "quote": string, "concern": string}]}.
  aiReviewFlags: jsonb("ai_review_flags").$type<{
    flags: { page: number | null; quote: string; concern: string }[];
  }>(),
  aiReviewedAt: timestamp("ai_reviewed_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// One row per question for a "questionnaire" dealClientNeed — questionText
// is copied from the catalog's clientNeedQuestions at add-time (same plain
// snapshot pattern as itemName/description on dealClientNeeds itself), and
// answerText stays null until the borrower submits the form.
export const dealClientNeedAnswers = pgTable("deal_client_need_answers", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientNeedId: uuid("client_need_id")
    .notNull()
    .references(() => dealClientNeeds.id, { onDelete: "cascade" }),
  questionText: text("question_text").notNull(),
  answerText: text("answer_text"),
  sortOrder: integer("sort_order").notNull().default(0),
  answeredAt: timestamp("answered_at", { mode: "date" }),
});

export const dealConditions = pgTable("deal_conditions", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  category: conditionCategoryEnum("category").notNull(),
  status: conditionStatusEnum("status").notNull().default("open"),
  processorNote: text("processor_note"),
  clearedAt: timestamp("cleared_at", { mode: "date" }),
  clearedByUserId: uuid("cleared_by_user_id").references(() => users.id),
  // Set only for category="borrower" — the AI's suggested client-need name/
  // description, shown as a pre-filled "add this as a client need?" prompt.
  suggestedNeedName: text("suggested_need_name"),
  suggestedNeedDescription: text("suggested_need_description"),
  // Once a processor turns a borrower condition into a real client need, we
  // link it here and consider the condition itself resolved — ongoing
  // collection status then lives on the Client Needs tab, not duplicated here.
  linkedClientNeedId: uuid("linked_client_need_id").references(() => dealClientNeeds.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const dealNotes = pgTable("deal_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  authorUserId: uuid("author_user_id").references(() => users.id),
  source: noteSourceEnum("source").notNull().default("user"),
  body: text("body").notNull(),
  // AI sanity-check flags are notes that can be dismissed/resolved (§8).
  resolved: boolean("resolved").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const pricingRequests = pgTable("pricing_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  lenderId: uuid("lender_id")
    .notNull()
    .references(() => lenders.id),
  lenderRepId: uuid("lender_rep_id")
    .notNull()
    .references(() => lenderReps.id),
  emailSubject: text("email_subject").notNull(),
  emailBody: text("email_body").notNull(),
  loNote: text("lo_note"),
  status: pricingRequestStatusEnum("status").notNull().default("draft"),
  sentAt: timestamp("sent_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),

  // Gmail thread this was sent in, so a reply can be found later.
  gmailMessageId: text("gmail_message_id"),
  gmailThreadId: text("gmail_thread_id"),
  replyCheckedAt: timestamp("reply_checked_at", { mode: "date" }),
  replyFrom: text("reply_from"),
  replyReceivedAt: timestamp("reply_received_at", { mode: "date" }),
  replyBodyText: text("reply_body_text"),
});

export const pricingRequestReplyAttachments = pgTable("pricing_request_reply_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  pricingRequestId: uuid("pricing_request_id")
    .notNull()
    .references(() => pricingRequests.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  data: text("data").notNull(), // base64
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const pricingRequestReplyAttachmentsRelations = relations(
  pricingRequestReplyAttachments,
  ({ one }) => ({
    pricingRequest: one(pricingRequests, {
      fields: [pricingRequestReplyAttachments.pricingRequestId],
      references: [pricingRequests.id],
    }),
  })
);

export const termSheets = pgTable("term_sheets", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  lenderId: uuid("lender_id")
    .notNull()
    .references(() => lenders.id),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id),
  fields: jsonb("fields").notNull().$type<Record<string, unknown>>(),
  pdfUrl: text("pdf_url"),
  status: termSheetStatusEnum("status").notNull().default("draft"),
  acceptedAt: timestamp("accepted_at", { mode: "date" }),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const surveys = pgTable("surveys", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  rating: integer("rating"),
  comments: text("comments"),
  submittedAt: timestamp("submitted_at", { mode: "date" }),
  remindersSentCount: integer("reminders_sent_count").notNull().default(0),
  lastReminderSentAt: timestamp("last_reminder_sent_at", { mode: "date" }),
});

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

export const emailTemplates = pgTable("email_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Stable machine key. Fixed for the built-in pricing_request templates
  // (code looks them up by key); freely chosen for borrower_lifecycle ones.
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  category: emailTemplateCategoryEnum("category").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  // Which pipeline stage this borrower email is meant to go out at — data
  // only for now (Justin will wire the actual automated send later). Null
  // for pricing_request templates and for borrower templates not yet tied
  // to a stage.
  triggerStage: dealStageEnum("trigger_stage"),
  active: boolean("active").notNull().default(true),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Relations (for the Drizzle relational query API — db.query.x.findMany({with}))
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  dealsAsLoanOfficer: many(deals, { relationName: "loanOfficerDeals" }),
  dealsAsProcessor: many(deals, { relationName: "processorDeals" }),
  dealsAsAssistant: many(deals, { relationName: "assistantDeals" }),
}));

export const lendersRelations = relations(lenders, ({ many }) => ({
  products: many(products),
  reps: many(lenderReps),
  documents: many(lenderDocuments),
}));

export const lenderRepsRelations = relations(lenderReps, ({ one }) => ({
  lender: one(lenders, { fields: [lenderReps.lenderId], references: [lenders.id] }),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  lender: one(lenders, { fields: [products.lenderId], references: [lenders.id] }),
  criteria: one(lenderCriteria, {
    fields: [products.id],
    references: [lenderCriteria.productId],
  }),
  clientNeeds: many(productClientNeeds),
  documents: many(lenderDocuments),
}));

export const lenderDocumentsRelations = relations(lenderDocuments, ({ one }) => ({
  lender: one(lenders, { fields: [lenderDocuments.lenderId], references: [lenders.id] }),
  product: one(products, { fields: [lenderDocuments.productId], references: [products.id] }),
  uploadedByUser: one(users, {
    fields: [lenderDocuments.uploadedBy],
    references: [users.id],
  }),
}));

export const lenderCriteriaRelations = relations(lenderCriteria, ({ one }) => ({
  product: one(products, {
    fields: [lenderCriteria.productId],
    references: [products.id],
  }),
}));

export const clientNeedsRelations = relations(clientNeeds, ({ many }) => ({
  questions: many(clientNeedQuestions),
  products: many(productClientNeeds),
  categoryLinks: many(categoryClientNeeds),
}));

export const clientNeedQuestionsRelations = relations(clientNeedQuestions, ({ one }) => ({
  clientNeed: one(clientNeeds, {
    fields: [clientNeedQuestions.clientNeedId],
    references: [clientNeeds.id],
  }),
}));

export const categoryClientNeedsRelations = relations(categoryClientNeeds, ({ one }) => ({
  clientNeed: one(clientNeeds, {
    fields: [categoryClientNeeds.clientNeedId],
    references: [clientNeeds.id],
  }),
}));

export const productClientNeedsRelations = relations(productClientNeeds, ({ one }) => ({
  product: one(products, {
    fields: [productClientNeeds.productId],
    references: [products.id],
  }),
  clientNeed: one(clientNeeds, {
    fields: [productClientNeeds.clientNeedId],
    references: [clientNeeds.id],
  }),
}));

export const dealsRelations = relations(deals, ({ one, many }) => ({
  assignedLoanOfficer: one(users, {
    fields: [deals.assignedLoanOfficerId],
    references: [users.id],
    relationName: "loanOfficerDeals",
  }),
  assignedProcessor: one(users, {
    fields: [deals.assignedProcessorId],
    references: [users.id],
    relationName: "processorDeals",
  }),
  assignedAssistant: one(users, {
    fields: [deals.assignedAssistantId],
    references: [users.id],
    relationName: "assistantDeals",
  }),
  lender: one(lenders, { fields: [deals.lenderId], references: [lenders.id] }),
  product: one(products, { fields: [deals.productId], references: [products.id] }),
  stageHistory: many(dealStageHistory),
  clientNeeds: many(dealClientNeeds),
  conditions: many(dealConditions),
  notes: many(dealNotes),
  pricingRequests: many(pricingRequests),
  termSheets: many(termSheets),
  portfolioProperties: many(dealPortfolioProperties),
  followers: many(dealFollowers),
  survey: one(surveys, { fields: [deals.id], references: [surveys.dealId] }),
}));

// People who want visibility into a deal's client-needs progress without
// being the assigned LO/processor/assistant — e.g. a referral LO or a
// capital partner. They're included on client-need reminder emails once
// that automation is built (see the parked Drive-automation memory).
export const dealFollowers = pgTable("deal_followers", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  roleLabel: text("role_label"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const dealFollowersRelations = relations(dealFollowers, ({ one }) => ({
  deal: one(deals, { fields: [dealFollowers.dealId], references: [deals.id] }),
}));

export const dealPortfolioPropertiesRelations = relations(dealPortfolioProperties, ({ one }) => ({
  deal: one(deals, { fields: [dealPortfolioProperties.dealId], references: [deals.id] }),
}));

export const dealStageHistoryRelations = relations(dealStageHistory, ({ one }) => ({
  deal: one(deals, { fields: [dealStageHistory.dealId], references: [deals.id] }),
  changedBy: one(users, {
    fields: [dealStageHistory.changedByUserId],
    references: [users.id],
  }),
}));

export const dealClientNeedsRelations = relations(dealClientNeeds, ({ one, many }) => ({
  deal: one(deals, { fields: [dealClientNeeds.dealId], references: [deals.id] }),
  documents: many(dealClientNeedDocuments),
  answers: many(dealClientNeedAnswers),
}));

export const dealClientNeedAnswersRelations = relations(dealClientNeedAnswers, ({ one }) => ({
  clientNeed: one(dealClientNeeds, {
    fields: [dealClientNeedAnswers.clientNeedId],
    references: [dealClientNeeds.id],
  }),
}));

export const dealClientNeedDocumentsRelations = relations(dealClientNeedDocuments, ({ one }) => ({
  clientNeed: one(dealClientNeeds, {
    fields: [dealClientNeedDocuments.clientNeedId],
    references: [dealClientNeeds.id],
  }),
  uploadedBy: one(users, {
    fields: [dealClientNeedDocuments.uploadedByUserId],
    references: [users.id],
  }),
  reviewedBy: one(users, {
    fields: [dealClientNeedDocuments.reviewedByUserId],
    references: [users.id],
  }),
}));

export const dealConditionsRelations = relations(dealConditions, ({ one }) => ({
  deal: one(deals, { fields: [dealConditions.dealId], references: [deals.id] }),
  clearedBy: one(users, {
    fields: [dealConditions.clearedByUserId],
    references: [users.id],
  }),
  linkedClientNeed: one(dealClientNeeds, {
    fields: [dealConditions.linkedClientNeedId],
    references: [dealClientNeeds.id],
  }),
}));

export const dealNotesRelations = relations(dealNotes, ({ one }) => ({
  deal: one(deals, { fields: [dealNotes.dealId], references: [deals.id] }),
  author: one(users, { fields: [dealNotes.authorUserId], references: [users.id] }),
}));

export const pricingRequestsRelations = relations(pricingRequests, ({ one, many }) => ({
  deal: one(deals, { fields: [pricingRequests.dealId], references: [deals.id] }),
  lender: one(lenders, { fields: [pricingRequests.lenderId], references: [lenders.id] }),
  lenderRep: one(lenderReps, {
    fields: [pricingRequests.lenderRepId],
    references: [lenderReps.id],
  }),
  replyAttachments: many(pricingRequestReplyAttachments),
}));

export const termSheetsRelations = relations(termSheets, ({ one }) => ({
  deal: one(deals, { fields: [termSheets.dealId], references: [deals.id] }),
  lender: one(lenders, { fields: [termSheets.lenderId], references: [lenders.id] }),
  product: one(products, { fields: [termSheets.productId], references: [products.id] }),
  createdByUser: one(users, {
    fields: [termSheets.createdBy],
    references: [users.id],
  }),
}));

export const surveysRelations = relations(surveys, ({ one }) => ({
  deal: one(deals, { fields: [surveys.dealId], references: [deals.id] }),
}));

export const emailTemplatesRelations = relations(emailTemplates, ({ one }) => ({
  updatedByUser: one(users, {
    fields: [emailTemplates.updatedByUserId],
    references: [users.id],
  }),
}));
