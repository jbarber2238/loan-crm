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
  time,
  timestamp,
  unique,
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

// "pricing_request", "insurance_request", "title_request", and
// "application_submission" templates are used by the app itself (rendered
// and sent at a fixed point in the deal flow) — their key/category are
// fixed, only content is editable. "borrower_lifecycle" templates are ones
// Justin defines himself for future automated sends to the borrower at a
// given pipeline stage.
export const emailTemplateCategoryEnum = pgEnum("email_template_category", [
  "pricing_request",
  "borrower_lifecycle",
  "insurance_request",
  "title_request",
  "application_submission",
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
  // A purpose-built, richly-typed form (real dropdowns, Yes/No toggles,
  // conditional follow-ups) matching a specific lender's own application
  // questions exactly — unlike "questionnaire" above (plain free-text Q&A),
  // this is hand-built per lender/loan-type rather than authored by a
  // processor. See src/lib/custom-need-forms/registry.ts for which
  // customFormKey values exist.
  "custom_form",
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

// "superseded" = this term sheet was accepted at some point, but the
// borrower/Justin later accepted a different one on the same deal instead —
// set automatically by performTermSheetAcceptance so at most one term sheet
// per deal is ever "accepted" at a time.
export const termSheetStatusEnum = pgEnum("term_sheet_status", [
  "draft",
  "generated",
  "accepted",
  "superseded",
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
  active: boolean("active").notNull().default(true),
  schedulingLink: text("scheduling_link"),
  emailSignatureHtml: text("email_signature_html"),
  // A processor's own "introducing myself to the borrower" templates — set
  // up once in My Profile, sent from a deal's "Send Intro Email"/"Send Intro
  // Text" buttons. Personal, not the shared admin Email Templates table:
  // each processor writes their own, the way emailSignatureHtml already
  // works, rather than one company-wide template everyone shares.
  borrowerIntroEmailSubject: text("borrower_intro_email_subject"),
  borrowerIntroEmailBody: text("borrower_intro_email_body"),
  borrowerIntroTextBody: text("borrower_intro_text_body"),
  // Shown in the Loan Originator Information section on generated term
  // sheets. NMLS is nullable — Justin doesn't have one yet.
  phone: text("phone"),
  nmlsNumber: text("nmls_number"),
  // Personal texting/calling hours (My Profile) — purely a work/life
  // boundary preference for INBOUND (a borrower calling this person), fully
  // freeform, null meaning "no restriction, always reachable." OUTBOUND
  // hours use the same shape but get clamped to companySettings'
  // tcpaOutboundStart/End at the point a call/text is actually sent — this
  // column is just this person's own preference within that ceiling, not a
  // legal boundary itself.
  inboundHoursStart: time("inbound_hours_start"),
  inboundHoursEnd: time("inbound_hours_end"),
  outboundHoursStart: time("outbound_hours_start"),
  outboundHoursEnd: time("outbound_hours_end"),
  // Null until the person finishes the first-login setup wizard (name,
  // scheduling link, email signature) — gates the (app) layout's redirect
  // to /onboarding. Backfilled to createdAt for everyone who predates the
  // wizard so they're never sent through it retroactively.
  onboardedAt: timestamp("onboarded_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// Referral partners — never get CRM login access (deliberately a separate
// table from `users`, since the whole app grants access purely by matching
// a signed-in Google email against a `users` row; keeping affiliates out of
// that table is what guarantees they can never sign in). An admin invites
// one by email (row created with just email + who invited them), the
// affiliate completes their own name/phone at the public /affiliate/[id]
// form, and only then is their referral link considered "live."
export const referralAffiliates = pgTable("referral_affiliate", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name"),
  phone: text("phone"),
  invitedByUserId: uuid("invited_by_user_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  // Null until they submit the public completion form.
  completedAt: timestamp("completed_at", { mode: "date" }),
  // Unguessable token driving the public, unauthenticated
  // /affiliate-payment-upload/[token] page — generated lazily the first time
  // we're about to send the "your deal closed" email, not at invite time.
  // That page is upload-only: no listing, no download, nothing readable
  // through it at all, only through the authenticated admin Settings page.
  wireInstructionsUploadToken: text("wire_instructions_upload_token").unique(),
});

export const referralAffiliatesRelations = relations(referralAffiliates, ({ one, many }) => ({
  invitedBy: one(users, { fields: [referralAffiliates.invitedByUserId], references: [users.id] }),
  deals: many(deals),
  paymentDocuments: many(affiliatePaymentDocuments),
}));

// One row per uploaded ACH/wire instructions file — base64 in Postgres, same
// storage pattern as lenderDocuments/dealClientNeedDocuments elsewhere in
// this app. Only ever written by the affiliate's own one-way upload link,
// only ever read by an admin from Settings > Referrals.
export const affiliatePaymentDocuments = pgTable("affiliate_payment_document", {
  id: uuid("id").primaryKey().defaultRandom(),
  affiliateId: uuid("affiliate_id")
    .notNull()
    .references(() => referralAffiliates.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  data: text("data").notNull(), // base64
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const affiliatePaymentDocumentsRelations = relations(affiliatePaymentDocuments, ({ one }) => ({
  affiliate: one(referralAffiliates, {
    fields: [affiliatePaymentDocuments.affiliateId],
    references: [referralAffiliates.id],
  }),
}));

// Singleton row (id is always "default") — company-wide settings editable
// from Settings → Company.
export const companySettings = pgTable("company_settings", {
  id: text("id").primaryKey().default("default"),
  name: text("name").notNull(),
  // Shown on every outgoing email template (pricing requests, borrower
  // lifecycle emails) — base64, same storage pattern as every other file
  // in this app. Null until Justin uploads one.
  logoFileName: text("logo_file_name"),
  logoMimeType: text("logo_mime_type"),
  logoData: text("logo_data"),
  // Computed at upload time (average luminance of the logo's own visible —
  // non-transparent — pixels) so the sidebar, the settings preview, and
  // outgoing emails can each pick a backdrop that contrasts with whatever
  // color the logo actually is, instead of assuming every uploaded logo is
  // dark. See computeLogoIsLight in src/server/actions/settings.ts.
  logoIsLight: boolean("logo_is_light").notNull().default(false),
  // PandaDoc integration (Settings → Integrations) — the API key for
  // creating/sending documents, and the shared key PandaDoc issues when the
  // webhook subscription pointing at /api/webhooks/pandadoc is created,
  // used to verify those webhook deliveries are genuinely from PandaDoc.
  pandadocApiKey: text("pandadoc_api_key"),
  pandadocWebhookSharedKey: text("pandadoc_webhook_shared_key"),
  // Stripe integration (Settings → Integrations) — this app's own secret key
  // for creating customers/invoices server-side, and the webhook signing
  // secret for verifying deliveries to /api/webhooks/stripe are genuinely
  // from Stripe. Separate from any Stripe access used elsewhere (e.g. an
  // MCP connection) — the deployed app needs its own credentials to run
  // this automatically in production.
  stripeSecretKey: text("stripe_secret_key"),
  stripeWebhookSecret: text("stripe_webhook_secret"),
  // Borrower texting & calling (Settings → Phone) — one shared company
  // number for the whole org, same "credentials live in this table, not env
  // vars" pattern as PandaDoc/Stripe above.
  twilioAccountSid: text("twilio_account_sid"),
  twilioAuthToken: text("twilio_auth_token"),
  twilioPhoneNumber: text("twilio_phone_number"),
  // The hard TCPA-safe ceiling for OUTBOUND calls/texts — "reasonable hours"
  // is measured against the person being called, not the staff member, so
  // this is an org-wide cap that a user's own outboundHoursStart/End (below)
  // can narrow but never exceed. Seeded to a conservative 8am-9pm; nullable
  // only until an admin sets it the first time (application code treats an
  // unset ceiling as "not configured yet," not "no limit").
  tcpaOutboundStart: time("tcpa_outbound_start"),
  tcpaOutboundEnd: time("tcpa_outbound_end"),
  // The Dashboard's metrics library (Settings → Dashboard Metrics) — every
  // metric not built into the "always on" set lives in DASHBOARD_METRIC_LIBRARY
  // (src/lib/dashboard-metric-library.ts) with a computable/not-yet flag;
  // this column just tracks which of the computable ones an admin has
  // actually turned on. Null/missing id = off, same as not being in the list.
  enabledDashboardMetrics: jsonb("enabled_dashboard_metrics").$type<string[]>().notNull().default([]),
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

export const lenderSubmissionMethodEnum = pgEnum("lender_submission_method", ["portal", "email"]);

export const lenders = pgTable("lenders", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  notes: text("notes"),
  // A link to the lender's own instant-pricing tool — when set, the Pricing
  // tab offers this instead of a drafted pricing email, since there's
  // nothing to send; you just go price it yourself.
  quickPricerUrl: text("quick_pricer_url"),
  // Null = not configured yet. "portal" needs brokerPortalUrl; "email" uses
  // introEmailSubject/introEmailBody as the Submit Application starting point.
  applicationSubmissionMethod: lenderSubmissionMethodEnum("application_submission_method"),
  brokerPortalUrl: text("broker_portal_url"),
  introEmailSubject: text("intro_email_subject"),
  introEmailBody: text("intro_email_body"),
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
  // --- AI-extracted structured criteria (see extract-lender-criteria.ts) ---
  // These flat fields cover a product whose whole matrix is one set of
  // thresholds; a matrix with a FICO/experience-tiered grid (different
  // LTC/LTARV caps per tier — the common case for hard-money/construction)
  // stores its rows in lenderCriteriaTiers instead, with these left null.
  maxLtc: numeric("max_ltc"),
  maxLtarv: numeric("max_ltarv"),
  minExperienceCount: integer("min_experience_count"),
  entityOnlyRequired: boolean("entity_only_required"),
  gcLicenseRequired: boolean("gc_license_required"),
  msaPopulationMinimum: integer("msa_population_minimum"),
  // Cross-cutting borrower/property eligibility flags — the quick yes/no
  // questions that decide whether a lender is even in play for a deal
  // before any of the numeric criteria matter.
  foreignNationalEligible: boolean("foreign_national_eligible"),
  itinEligible: boolean("itin_eligible"),
  ruralEligible: boolean("rural_eligible"),
  // Provenance/review — this data now drives matching decisions by itself
  // (no more re-reading the source document every time), so a wrong
  // extraction is a real, silent liability until someone checks it.
  extractedAt: timestamp("extracted_at", { withTimezone: true }),
  extractedFromDocumentId: uuid("extracted_from_document_id").references(() => lenderDocuments.id, {
    onDelete: "set null",
  }),
  needsReview: boolean("needs_review").notNull().default(false),
  extractionNotes: text("extraction_notes"),
});

// A lender-wide document (a cross-program overlay like a foreign-national
// matrix, or a general guideline sheet) isn't scoped to one product/category
// the way lenderCriteria is — it applies across everything that lender
// offers. One row per lender, extracted the same one-time way as product
// criteria, so a lender-match run can reference these plain facts instead of
// re-reading that document's images/text on every single run.
export const lenderWideCriteria = pgTable("lender_wide_criteria", {
  id: uuid("id").primaryKey().defaultRandom(),
  lenderId: uuid("lender_id")
    .notNull()
    .unique()
    .references(() => lenders.id, { onDelete: "cascade" }),
  foreignNationalEligible: boolean("foreign_national_eligible"),
  itinEligible: boolean("itin_eligible"),
  ruralEligible: boolean("rural_eligible"),
  otherNotes: text("other_notes"),
  extractedAt: timestamp("extracted_at", { withTimezone: true }),
  extractedFromDocumentId: uuid("extracted_from_document_id").references(() => lenderDocuments.id, {
    onDelete: "set null",
  }),
  needsReview: boolean("needs_review").notNull().default(false),
  extractionNotes: text("extraction_notes"),
});

// One row per FICO/experience tier on a matrix whose leverage caps vary by
// tier (e.g. "700-739 FICO, 8+ deals -> 90% LTC / 70% LTARV") — the shape
// every real hard-money/construction matrix we've read actually uses,
// rather than a single flat max. A product with a flat (non-tiered) matrix
// simply has no rows here and uses lenderCriteria's own maxLtc/maxLtarv/
// maxLtv instead.
export const lenderCriteriaTiers = pgTable("lender_criteria_tiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  criteriaId: uuid("criteria_id")
    .notNull()
    .references(() => lenderCriteria.id, { onDelete: "cascade" }),
  ficoMin: integer("fico_min"),
  ficoMax: integer("fico_max"),
  experienceMin: integer("experience_min"),
  maxLtc: numeric("max_ltc"),
  maxLtarv: numeric("max_ltarv"),
  maxLtv: numeric("max_ltv"),
  notes: text("notes"),
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
  // custom_form: which hand-built form definition to render — a key into
  // CUSTOM_NEED_FORM_REGISTRY (src/lib/custom-need-forms/registry.ts).
  customFormKey: text("custom_form_key"),
  // Deal-specific trigger (see src/server/client-need-rules.ts) — when set,
  // this item is added to a deal only if that rule's condition holds for it
  // (e.g. the property is tenant-occupied), on top of the normal catalog layers.
  autoRule: text("auto_rule"),
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
  // The borrower can't submit the form until every required question has an
  // answer — copied onto dealClientNeedAnswers when the need is added to a deal.
  required: boolean("required").notNull().default(false),
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
  // titleCompanyAgentName is the contact PERSON's name; titleCompanyName
  // (added later, once a lender's own application form asked for both
  // separately) is the firm itself — kept as two fields instead of folding
  // company into the "agent name" string like the original Roles tab did.
  titleCompanyAgentName: text("title_company_agent_name"),
  titleCompanyName: text("title_company_name"),
  titleAgentEmail: text("title_agent_email"),
  titleAgentPhone: text("title_agent_phone"),
  insuranceAgency: text("insurance_agency"),
  insuranceAgentName: text("insurance_agent_name"),
  insuranceAgentEmail: text("insurance_agent_email"),
  insuranceAgentPhone: text("insurance_agent_phone"),
  // Distinct from the plain staff-tracking `insuranceNotes` field further
  // down (a Key Date Tracker jot-note) — this is a borrower-facing "notes
  // about the policy" answer collected on a lender's own application form.
  insuranceContactNotes: text("insurance_contact_notes"),
  // Which processor has already been sent the "ready to process" email —
  // so it goes out exactly once per processor, whether it's triggered by the
  // fee being paid with a processor already assigned, or by assigning one
  // to a deal that's already paid and in Application.
  processorReadyNotifiedUserId: uuid("processor_ready_notified_user_id"),
  // Whoever will let the appraiser into the property — not every lender's
  // application asks for this, but it's collected here as one shared spot
  // regardless of which client need (or custom lender form) actually
  // gathers it from the borrower first. Same "one shared field, several
  // possible sources" pattern as the title/insurance contacts above.
  interiorAccessContactRelationship: text("interior_access_contact_relationship"),
  interiorAccessContactName: text("interior_access_contact_name"),
  interiorAccessContactEmail: text("interior_access_contact_email"),
  interiorAccessContactPhone: text("interior_access_contact_phone"),
  interiorAccessLockBoxInfo: text("interior_access_lock_box_info"),
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
  // Structured referral tracking — separate from the free-text `source`
  // field above (which stays as the borrower's own "Who referred you?"
  // answer). Set when the deal came in through a referral affiliate's own
  // link/embed code.
  referredByAffiliateId: uuid("referred_by_affiliate_id").references(() => referralAffiliates.id),
  // False when this borrower (matched by email) already had an earlier deal
  // referred by the same affiliate — no perpetual referral fees for repeat
  // business from the same borrower, only the first deal counts. Set once at
  // creation and never changed afterward.
  referralFeeEligible: boolean("referral_fee_eligible").notNull().default(true),
  // Null = no fee owed yet, or owed but not yet paid; set once Justin has
  // actually issued payment to the affiliate for this specific deal.
  referralFeePaidAt: timestamp("referral_fee_paid_at", { mode: "date" }),
  // Each set the first time (and only the first time) the deal reaches that
  // stage, so a deal bouncing back and forth between stages never sends the
  // affiliate a duplicate notification.
  referralApplicationEmailSentAt: timestamp("referral_application_email_sent_at", { mode: "date" }),
  referralClosedEmailSentAt: timestamp("referral_closed_email_sent_at", { mode: "date" }),
  referralLostEmailSentAt: timestamp("referral_lost_email_sent_at", { mode: "date" }),
  // A standing note the LO can jot down for lender reps — unique
  // situations, things to flag up front — included on new pricing emails.
  pricingNoteToRep: text("pricing_note_to_rep"),
  // When either borrower-facing send actually went out — a deal-level
  // visual cue (next to the two buttons) for "which option did we already
  // use," since a staffer's own Gmail Sent folder isn't visible to anyone
  // else on the team. Most recent send wins if the same one is used twice.
  termSheetsSentToBorrowerAt: timestamp("term_sheets_sent_to_borrower_at", { mode: "date", withTimezone: true }),
  bookACallSentAt: timestamp("book_a_call_sent_at", { mode: "date", withTimezone: true }),
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
  // Fix-and-flip/new-construction/bridge quote their term in months, not
  // years — same "final term" concept as finalLoanTermYears above, just the
  // unit hard-money/bridge lenders actually use.
  finalLoanTermMonths: integer("final_loan_term_months"),
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
  // based on appraisedValue once it's in. On fix-and-flip/new-construction
  // deals this same flag/column doubles as the LTC as-is-value basis — a
  // deal is only ever one shape or the other, so one column covers both.
  ltvBasedOnPurchasePrice: boolean("ltv_based_on_purchase_price").notNull().default(true),
  // Fix-and-flip/new-construction only, promoted from the accepted term
  // sheet's approvedRehabCost/approvedArv fields — the lender-quoted budget
  // and ARV used for LTC/LTARV before an appraisal comes back. Editable
  // afterward like the rest of the accepted terms.
  approvedRehabCost: numeric("approved_rehab_cost"),
  approvedArv: numeric("approved_arv"),
  // Also fix-and-flip/new-construction only, promoted from the term sheet's
  // initialAdvance/interestType fields — needed for the accepted-terms
  // header's Initial Advance tile and its Dutch-vs-Non-Dutch monthly
  // payment display.
  approvedInitialAdvance: numeric("approved_initial_advance"),
  interestType: text("interest_type"),
  // The appraised after-repair value, once the appraisal comes in — null
  // until then. LTARV uses this instead of approvedArv when
  // ltarvBasedOnApprovedArv is false.
  appraisedArv: numeric("appraised_arv"),
  // true = LTARV is based on the lender-quoted approvedArv (the default);
  // false = based on appraisedArv once it's in. Same pattern as
  // ltvBasedOnPurchasePrice above, just for the ARV side instead of the
  // as-is side.
  ltarvBasedOnApprovedArv: boolean("ltarv_based_on_approved_arv").notNull().default(true),
  // Stored/editable like approvedLtv — LTARV = approvedLoanAmount ÷
  // (appraisedArv or approvedArv, per the toggle above).
  approvedLtarv: numeric("approved_ltarv"),
  // Stored/editable like approvedLtv — LTC = approvedLoanAmount ÷
  // (as-is value basis + approvedRehabCost).
  approvedLtc: numeric("approved_ltc"),
  // Lender points / rate buydown fee on the accepted terms — separate from
  // our own origination fee and processing fee. On DSCR/Portfolio deals this
  // is a derived display (loanAmount × rateBuydownPointsOverride ÷ 100, no
  // floor) rather than entered directly; still stored/edited directly for
  // Bridge/hard-money ("Lender Fee"), which isn't a points-based concept.
  costToBorrowerFee: numeric("cost_to_borrower_fee"),
  // Null = no buydown (0%). Only meaningful on DSCR/Portfolio deals, where
  // costToBorrowerFee ("Rate Buydown Fee") is always derived from this
  // rather than entered directly — seeded from the term sheet's own Rate
  // Buydown Points field at acceptance; editable afterward.
  rateBuydownPointsOverride: numeric("rate_buydown_points_override"),
  // Null = use the standard $999 (STANDARD_PROCESSING_FEE) — only set this
  // when the borrower actually negotiated something different.
  processingFeeOverride: numeric("processing_fee_override"),
  // Null = the standard 2%. The dollar origination fee is always derived
  // from this (loanAmount × points/100, $2,500 floor) rather than entered
  // directly — set only when negotiated to something else. Seeded from the
  // term sheet's own Origination Points field at acceptance; editable
  // afterward. This is the basis for a deal's Lead Value once a term sheet
  // is accepted.
  originationPointsOverride: numeric("origination_points_override"),
  // Rate lock timing varies by lender (some lock at application, some only
  // after appraisal) — this is a plain manual toggle, not tied to a stage.
  rateLocked: boolean("rate_locked").notNull().default(false),
  rateLockedAt: timestamp("rate_locked_at", { mode: "date" }),
  creditPullDate: timestamp("credit_pull_date", { mode: "date" }),
  // A running note per key-date-tracker item — not itself part of the audit
  // trail (see dealKeyDateEvents below), just a plain field a processor can
  // jot anything into ("agent said binder will be backdated to closing").
  appraisalNotes: text("appraisal_notes"),
  insuranceNotes: text("insurance_notes"),
  titleNotes: text("title_notes"),
  // The appraisal report itself, uploaded from the Key Dates tab — one slot
  // per deal (a re-upload replaces it), stored the same base64-in-Postgres
  // way as every other small applicant/lender file in this app. Feeds the
  // AI scan that reads appraisedValue/appraisedArv (and, on a DSCR deal,
  // market rent) straight off the report instead of retyping it by hand.
  appraisalDocumentFileName: text("appraisal_document_file_name"),
  appraisalDocumentMimeType: text("appraisal_document_mime_type"),
  appraisalDocumentData: text("appraisal_document_data"),
  clientNeedsRemindersPaused: boolean("client_needs_reminders_paused")
    .notNull()
    .default(false),
  // How often the (not-yet-built) automated client-needs reminder should
  // re-send while items are outstanding. 24/48/72/168 (weekly) hours.
  clientNeedsReminderIntervalHours: integer("client_needs_reminder_interval_hours")
    .notNull()
    .default(24),
  driveLink: text("drive_link"),

  // Processing-fee invoice, auto-generated via Stripe right after the
  // borrower signs their accepted term sheet (see performTermSheetAcceptance
  // in src/server/actions/term-sheets.ts and src/server/stripe.ts).
  // stripeCustomerId is reused across a deal's lifetime; stripeInvoiceId is
  // set once the invoice is created and stripeInvoiceStatus tracks it via
  // the Stripe webhook (src/app/api/webhooks/stripe/route.ts) so we know
  // when it's been paid.
  stripeCustomerId: text("stripe_customer_id"),
  stripeInvoiceId: text("stripe_invoice_id"),
  stripeInvoiceStatus: text("stripe_invoice_status"),
  // The amount actually invoiced (not necessarily today's processingFeeOverride)
  // — compared against the live fee to decide whether a changed fee needs a
  // fresh invoice. hosted_invoice_url is stored so Justin can copy/text the
  // payment link without an extra Stripe API call every time he wants it.
  stripeInvoiceAmount: numeric("stripe_invoice_amount"),
  stripeInvoiceUrl: text("stripe_invoice_url"),

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
  // DSCR Cash-Out Refinance only — whether rehab was done since purchase is
  // asked explicitly there (unlike Fix & Flip/New Construction, where rehab
  // is a given); estimatedRehabCost/rehabDescription below are shared with
  // those categories and only required here when this is true. Lenders use
  // this alongside propertyPurchaseDate to judge cash-out eligibility — a
  // recent purchase with no rehab reads very differently than one with real
  // value-add work behind it.
  didRehabSincePurchase: boolean("did_rehab_since_purchase"),
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

  // Manually-triggered (button click, never automatic) — stores its own
  // result blob plus when it last ran, so the section can show stale results
  // with their timestamp instead of re-running on every visit.
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

  // Soft delete — deliberately NOT admin-only to trigger (see deleteDeal),
  // but only an admin can ever see or restore one afterward (see
  // restoreDeletedDeal / the admin-only deleted-deals view); purged for
  // real by purgeExpiredDeletedDeals after DELETED_DEAL_PURGE_AFTER_DAYS.
  deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
  deletedByUserId: uuid("deleted_by_user_id").references(() => users.id),

  // Archive — only reachable from Lost/Closed (see archiveDeal); hides the
  // deal from the live Pipeline board but never deletes anything. Null
  // archivedByUserId means autoArchiveStaleDeals did it, not a person.
  archivedAt: timestamp("archived_at", { mode: "date", withTimezone: true }),
  archivedByUserId: uuid("archived_by_user_id").references(() => users.id),
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

// Drives the public, unauthenticated /dscr-refi/[token] page — sent to a
// fix-and-flip/new-construction borrower once their project is done and
// they want to refinance into a DSCR loan, so they only have to confirm the
// borrower/property info that hasn't changed and fill in the handful of
// fields that are genuinely new (current value, rent, taxes, which kind of
// refinance). See src/server/actions/deal-conversion.ts.
export const dealConversionLinks = pgTable("deal_conversion_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: text("token").notNull().unique(),
  sourceDealId: uuid("source_deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  createdByUserId: uuid("created_by_user_id")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  // Set once the borrower submits — a used link's page shows "already
  // submitted" instead of the form, and can never create a second deal.
  usedAt: timestamp("used_at", { mode: "date", withTimezone: true }),
  resultingDealId: uuid("resulting_deal_id").references(() => deals.id),
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

export const keyDateItemEnum = pgEnum("key_date_item", ["appraisal", "insurance", "title"]);

// The Key Date Tracker's audit trail — one row per status change. There's no
// separate "current status" column anywhere: the tracker's current status
// and date for an item is just its most recent row here, so the log and the
// display can never drift out of sync with each other.
export const dealKeyDateEvents = pgTable("deal_key_date_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  item: keyDateItemEnum("item").notNull(),
  status: text("status").notNull(),
  // The date the status actually took effect (editable/backdatable at entry
  // time) — distinct from createdAt, which is just when the row was logged.
  eventDate: timestamp("event_date", { mode: "date" }).notNull(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
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
  // custom_form: copied from the catalog item at add-time, plus everything
  // the borrower submits — one JSONB blob keyed by field name rather than
  // the one-row-per-question shape questionnaire needs use, since a custom
  // form's ~70 typed fields (selects, dates, conditional follow-ups) don't
  // fit that flat text-question/text-answer model.
  customFormKey: text("custom_form_key"),
  customFormData: jsonb("custom_form_data").$type<Record<string, string>>(),
  customFormSubmittedAt: timestamp("custom_form_submitted_at", { mode: "date" }),
  sentAt: timestamp("sent_at", { mode: "date" }),
  // On hold: a flag layered over `status` (which keeps its real value) so
  // resuming restores exactly where the need was. While set, the need is
  // left out of borrower emails and the borrower upload page; the note is
  // required so the reason is still known later.
  onHoldAt: timestamp("on_hold_at", { mode: "date", withTimezone: true }),
  onHoldNote: text("on_hold_note"),
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
  required: boolean("required").notNull().default(false),
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
  // Editable, defaults to blank — a processor/LOA/other CRM person can be
  // added on before sending, but the lender rep is always the sole default To.
  emailCc: text("email_cc"),
  loNote: text("lo_note"),
  // This lender has a quick pricer instead of taking pricing by email — the
  // row exists to keep the card in the same grouped-by-lender list (and to
  // anchor an AI screenshot extraction), but has no real subject/body/send.
  isQuickPricer: boolean("is_quick_pricer").notNull().default(false),
  status: pricingRequestStatusEnum("status").notNull().default("draft"),
  sentAt: timestamp("sent_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),

  // The lender's reply, entered manually (pasted email text and/or an
  // uploaded PDF/screenshot) — not read from Gmail. Reading a lender's
  // actual reply out of the loan officer's inbox would need Gmail's
  // gmail.readonly scope, which Google classifies as "restricted": on top
  // of the usual verification, that requires an annual third-party
  // security audit (a real recurring cost), which isn't worth it for this.
  // replyReceivedAt is "when this was added," not literally an email
  // timestamp.
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
  // Set when this term sheet is included in a "Send to borrower" email
  // (sendTermSheetsToBorrowerEmail) — distinct from being sent for
  // e-signature via PandaDoc, so the two can show different statuses
  // ("Sent for Review" vs "Pending Signature") instead of collapsing into
  // one ambiguous "Sent".
  sentForReviewAt: timestamp("sent_for_review_at", { mode: "date" }),
  // Set when this term sheet is sent to PandaDoc for e-signature — mirrors
  // the same two columns on dealClientNeeds. The webhook (see
  // src/app/api/webhooks/pandadoc/route.ts) checks both tables by
  // pandadocDocumentId; when a term sheet's document completes, it's
  // accepted automatically instead of going through the document-review
  // pipeline a client-need upload does.
  pandadocDocumentId: text("pandadoc_document_id"),
  pandadocStatus: text("pandadoc_status"),
  // The actual signed PDF, pulled down via the PandaDoc API once the webhook
  // reports document.completed (see src/app/api/webhooks/pandadoc/route.ts)
  // — separate from the acceptance/field-promotion that already happens
  // automatically, since until now only the structured numbers came back,
  // never the signed document itself.
  signedDocumentFileName: text("signed_document_file_name"),
  signedDocumentMimeType: text("signed_document_mime_type"),
  signedDocumentData: text("signed_document_data"),
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
  dealsDeletedByUser: many(deals, { relationName: "deletedByUserDeals" }),
  dealsArchivedByUser: many(deals, { relationName: "archivedByUserDeals" }),
}));

export const lendersRelations = relations(lenders, ({ one, many }) => ({
  products: many(products),
  reps: many(lenderReps),
  documents: many(lenderDocuments),
  wideCriteria: one(lenderWideCriteria, {
    fields: [lenders.id],
    references: [lenderWideCriteria.lenderId],
  }),
}));

export const lenderWideCriteriaRelations = relations(lenderWideCriteria, ({ one }) => ({
  lender: one(lenders, { fields: [lenderWideCriteria.lenderId], references: [lenders.id] }),
  extractedFromDocument: one(lenderDocuments, {
    fields: [lenderWideCriteria.extractedFromDocumentId],
    references: [lenderDocuments.id],
  }),
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

export const lenderCriteriaRelations = relations(lenderCriteria, ({ one, many }) => ({
  product: one(products, {
    fields: [lenderCriteria.productId],
    references: [products.id],
  }),
  extractedFromDocument: one(lenderDocuments, {
    fields: [lenderCriteria.extractedFromDocumentId],
    references: [lenderDocuments.id],
  }),
  tiers: many(lenderCriteriaTiers),
}));

export const lenderCriteriaTiersRelations = relations(lenderCriteriaTiers, ({ one }) => ({
  criteria: one(lenderCriteria, {
    fields: [lenderCriteriaTiers.criteriaId],
    references: [lenderCriteria.id],
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
  referredByAffiliate: one(referralAffiliates, {
    fields: [deals.referredByAffiliateId],
    references: [referralAffiliates.id],
  }),
  stageHistory: many(dealStageHistory),
  keyDateEvents: many(dealKeyDateEvents),
  clientNeeds: many(dealClientNeeds),
  conditions: many(dealConditions),
  notes: many(dealNotes),
  pricingRequests: many(pricingRequests),
  termSheets: many(termSheets),
  portfolioProperties: many(dealPortfolioProperties),
  followers: many(dealFollowers),
  survey: one(surveys, { fields: [deals.id], references: [surveys.dealId] }),
  conversations: many(dealConversations),
  deletedByUser: one(users, {
    fields: [deals.deletedByUserId],
    references: [users.id],
    relationName: "deletedByUserDeals",
  }),
  archivedByUser: one(users, {
    fields: [deals.archivedByUserId],
    references: [users.id],
    relationName: "archivedByUserDeals",
  }),
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
  phone: text("phone"),
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

export const dealKeyDateEventsRelations = relations(dealKeyDateEvents, ({ one }) => ({
  deal: one(deals, { fields: [dealKeyDateEvents.dealId], references: [deals.id] }),
  createdBy: one(users, {
    fields: [dealKeyDateEvents.createdByUserId],
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

// --- Borrower texting & calling (scoped 2026-09-17, see the plan doc) -----

export const messageDirectionEnum = pgEnum("message_direction", ["inbound", "outbound"]);
export const callStatusEnum = pgEnum("call_status", [
  "ringing",
  "in_progress",
  "completed",
  "no_answer",
  "busy",
  "failed",
  "voicemail",
]);
// Which bucket of staff an inbound call/text for a deal in this stage should
// route to — "loan_officer" means the LOA-first-then-LO chain, not literally
// only the loan officer. See resolveInboundRoute in src/server/phone-routing.ts.
export const phoneRoutingRoleEnum = pgEnum("phone_routing_role", ["loan_officer", "processor"]);

// A "conversation" is keyed by the other party's phone number, not by deal —
// dealId is nullable so a call/text can exist (and show up in the Inbox)
// before it's ever matched to a deal, either because it's a brand-new lead
// or because the caller used a number that isn't the one on file. Attaching
// to a deal later is just setting this column, not moving message rows.
export const dealConversations = pgTable(
  "deal_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Purely informational — whichever deal this conversation happened to
    // be created from first. NOT used to look conversations up anymore: a
    // borrower gets exactly one thread across every deal they have, per the
    // "no per-deal messaging facade" decision — see getOrCreateConversationForPhone.
    dealId: uuid("deal_id").references(() => deals.id, { onDelete: "set null" }),
    // The other party's own number — usually the borrower's, but could be
    // whoever first texted/called in before any deal was matched. Unique:
    // this is the real lookup key, enforced in Postgres so a race between
    // two deals for the same borrower can't ever fork into two threads.
    primaryPhone: text("primary_phone").notNull(),
    lastMessageAt: timestamp("last_message_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    // Named startedAt, not createdAt — see the withTimezone note below, this
    // rename turned out to be unrelated to the actual bug but is a reasonable
    // name regardless and harmless to keep.
    startedAt: timestamp("started_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("deal_conversations_primary_phone_unique").on(table.primaryPhone)]
);

export const dealMessages = pgTable("deal_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => dealConversations.id, { onDelete: "cascade" }),
  direction: messageDirectionEnum("direction").notNull(),
  body: text("body").notNull(),
  fromNumber: text("from_number").notNull(),
  toNumber: text("to_number").notNull(),
  // Null for inbound (the borrower doesn't have a user row) and for any
  // outbound message sent by automation rather than a person.
  sentByUserId: uuid("sent_by_user_id").references(() => users.id),
  twilioSid: text("twilio_sid"),
  status: text("status"),
  // withTimezone: true is required here — the raw-SQL migration for this
  // table created the column as `timestamptz`, and Drizzle's relational
  // query API silently produces an Invalid Date (which then serializes to
  // null) when the schema's declared type doesn't match the actual column
  // type. Confirmed directly: the raw SQL Drizzle generates returns the
  // correct value; only the JS-side date decoding was wrong. Every
  // timestamp column added for texting/calling needs this.
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  // Inbound only — null means unread. Outbound messages don't need this
  // (they're never "unread" to us), so it's left null for those too.
  readAt: timestamp("read_at", { mode: "date", withTimezone: true }),
});

// Ad-hoc extra numbers added to one specific conversation (a co-signer, a
// spouse) — deliberately not a permanent column on deals; see the plan doc's
// "group texts are ad-hoc" decision.
export const dealConversationParticipants = pgTable("deal_conversation_participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => dealConversations.id, { onDelete: "cascade" }),
  name: text("name"),
  phone: text("phone").notNull(),
  addedAt: timestamp("added_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});

// The "Other" contact-directory bucket — Borrower/Insurance/Title/Lender
// Rep/Referral Partner contacts are all sourced live from their own
// existing tables (deals, lenderReps, referralAffiliates) rather than
// duplicated here; this table exists only for a person who doesn't fit any
// of those (an appraiser, a one-off contact) but who staff still want to
// find by name in the message-compose search and call/text directly.
export const otherContacts = pgTable("other_contacts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  notes: text("notes"),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});

export const dealCallLogs = pgTable("deal_call_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => dealConversations.id, { onDelete: "cascade" }),
  direction: messageDirectionEnum("direction").notNull(),
  // Outbound: who clicked "call." Inbound: who the call was ultimately
  // routed to/connected with (null if it never connected to anyone).
  initiatedByUserId: uuid("initiated_by_user_id").references(() => users.id),
  counterpartyNumber: text("counterparty_number").notNull(),
  startedAt: timestamp("started_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  answeredAt: timestamp("answered_at", { mode: "date", withTimezone: true }),
  endedAt: timestamp("ended_at", { mode: "date", withTimezone: true }),
  durationSeconds: integer("duration_seconds"),
  status: callStatusEnum("status").notNull().default("ringing"),
  twilioCallSid: text("twilio_call_sid"),
  // Set only for a missed inbound call that went to voicemail — Twilio's
  // hosted recording URL (see twilio-voice-recording webhook). No
  // transcription yet.
  recordingUrl: text("recording_url"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  // Set once someone's actually listened to the voicemail (or acknowledged
  // a missed call with none) — only meaningful when recordingUrl is set or
  // status is "voicemail"/a missed inbound call; drives the same unread
  // badge as an unread text.
  reviewedAt: timestamp("reviewed_at", { mode: "date", withTimezone: true }),
});

// Which role bucket an inbound call/text routes to, by the deal's current
// stage — admin-editable (Settings → Phone), seeded with Justin's own rule:
// everything pre-Application (plus anything that fell out the back —
// on_hold/lost/follow_up/disqualified) goes to the LOA-then-LO chain;
// Application through Clear to Close goes to the processor.
export const phoneStageRouting = pgTable("phone_stage_routing", {
  stage: dealStageEnum("stage").primaryKey(),
  targetRole: phoneRoutingRoleEnum("target_role").notNull(),
});

// Fallback chain for a call/text that doesn't match any deal at all (wrong
// number, or a brand-new lead calling in before anyone's assigned) — a real
// ordered sequence from day one, even though it's just Justin today. See
// resolveUnmatchedRoute in src/server/phone-routing.ts.
export const phoneUnmatchedRouting = pgTable("phone_unmatched_routing", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull(),
});

export const dealConversationsRelations = relations(dealConversations, ({ one, many }) => ({
  deal: one(deals, { fields: [dealConversations.dealId], references: [deals.id] }),
  messages: many(dealMessages),
  participants: many(dealConversationParticipants),
  callLogs: many(dealCallLogs),
}));

export const dealMessagesRelations = relations(dealMessages, ({ one }) => ({
  conversation: one(dealConversations, {
    fields: [dealMessages.conversationId],
    references: [dealConversations.id],
  }),
  sentByUser: one(users, { fields: [dealMessages.sentByUserId], references: [users.id] }),
}));

export const dealConversationParticipantsRelations = relations(dealConversationParticipants, ({ one }) => ({
  conversation: one(dealConversations, {
    fields: [dealConversationParticipants.conversationId],
    references: [dealConversations.id],
  }),
}));

export const dealCallLogsRelations = relations(dealCallLogs, ({ one }) => ({
  conversation: one(dealConversations, {
    fields: [dealCallLogs.conversationId],
    references: [dealConversations.id],
  }),
  initiatedByUser: one(users, { fields: [dealCallLogs.initiatedByUserId], references: [users.id] }),
}));

export const phoneUnmatchedRoutingRelations = relations(phoneUnmatchedRouting, ({ one }) => ({
  user: one(users, { fields: [phoneUnmatchedRouting.userId], references: [users.id] }),
}));

// Every task a borrower completes (upload, questionnaire, application form,
// signed PandaDoc form) is logged here instead of triggering an email. A
// cron sweep (src/server/borrower-activity.ts) waits for the borrower to go
// quiet, then sends ONE combined email covering everything since the last
// one — so a 30-minute session is a single message, not one per task.
export const borrowerActivityEvents = pgTable("borrower_activity_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  dealId: uuid("deal_id")
    .notNull()
    .references(() => deals.id, { onDelete: "cascade" }),
  needId: uuid("need_id").references(() => dealClientNeeds.id, { onDelete: "set null" }),
  itemName: text("item_name").notNull(),
  kind: text("kind").notNull(), // upload | questionnaire | application | signed
  occurredAt: timestamp("occurred_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  notifiedAt: timestamp("notified_at", { mode: "date", withTimezone: true }),
});
