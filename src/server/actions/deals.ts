"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CLIENT_NEEDS_REMINDER_INTERVAL_HOURS } from "@/lib/client-needs-reminders";
import { db } from "@/server/db/client";
import {
  dealConversations,
  dealFollowers,
  dealNotes,
  dealPortfolioProperties,
  dealStageEnum,
  dealStageHistory,
  deals,
  termSheets,
} from "@/server/db/schema";
import { requireUser, requireAdmin } from "@/server/auth/guards";
import { formatAddress } from "@/lib/format";
import {
  PAUSED_STAGES,
  TERMINAL_NEGATIVE_STAGES,
  STAGES_REQUIRING_REASON,
  STAGES_REQUIRING_CONFIRMATION,
  isPipelineStage,
  ARCHIVABLE_STAGES,
} from "@/lib/deal-pipeline";
import {
  findIneligiblePortfolioProperty,
  intakeToDealFields,
  parseIntakeFormData,
} from "@/server/actions/parse-intake";
import { extractTermSheetFields } from "@/lib/term-sheet-fields";
import { conservativeValueBasis, calculateLtarv, calculateLtc } from "@/lib/term-sheet-calculations";
import { syncProcessingFeeInvoice } from "@/server/billing";
import { toE164 } from "@/server/twilio-client";
import { notifyAffiliateOfNewDeal, notifyAffiliateOfStageChange } from "@/server/actions/referral-affiliates";
import { notifyAdminOfNewDeal, notifyBorrowerOfSubmission } from "@/server/deal-notifications";

const HARD_MONEY_DRAW_CATEGORIES = new Set(["fix_and_flip", "new_construction"]);

function str(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function nullableStr(formData: FormData, key: string) {
  const value = str(formData, key);
  return value.length ? value : null;
}

function nullableInt(formData: FormData, key: string) {
  const value = nullableStr(formData, key);
  return value !== null ? parseInt(value, 10) : null;
}

function boolField(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function yesNoOrNull(formData: FormData, key: string): boolean | null {
  const value = formData.get(key);
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

function dateOrNull(formData: FormData, key: string) {
  const value = str(formData, key);
  return value ? new Date(value) : null;
}

export async function createDeal(formData: FormData) {
  const user = await requireUser();

  const assignedLoanOfficerId = str(formData, "assignedLoanOfficerId") || user.id;
  const assignedProcessorId = nullableStr(formData, "assignedProcessorId");
  const assignedAssistantId = nullableStr(formData, "assignedAssistantId");
  const driveLink = nullableStr(formData, "driveLink");

  const dealId = await createDealFromIntake(formData, {
    assignedLoanOfficerId,
    assignedProcessorId,
    assignedAssistantId,
    driveLink,
    noteAuthorUserId: user.id,
    stageChangedByUserId: user.id,
  });

  // Started from an Inbox conversation (a call/text that didn't match any
  // deal) — attach it now that the deal exists, so the conversation moves
  // out of the Inbox and onto this deal's own Messages tab.
  const conversationId = nullableStr(formData, "conversationId");
  if (conversationId) {
    await db.update(dealConversations).set({ dealId }).where(eq(dealConversations.id, conversationId));
  }

  revalidatePath("/");
  revalidatePath("/dashboard");
  redirect(`/deals/${dealId}`);
}

/**
 * Shared by the staff "New Deal" form (createDeal, above) and the public
 * intake form (submitPublicIntake, src/server/actions/intake.ts) — both post
 * the same rich field set from IntakeFormFields; only assignment/attribution
 * differs between a logged-in staffer and an anonymous borrower.
 */
export async function createDealFromIntake(
  formData: FormData,
  options: {
    assignedLoanOfficerId: string;
    assignedProcessorId: string | null;
    assignedAssistantId: string | null;
    driveLink: string | null;
    noteAuthorUserId: string | null;
    stageChangedByUserId: string;
    referredByAffiliateId?: string | null;
  }
) {
  const parsed = parseIntakeFormData(formData);
  if (!parsed.loanCategory) throw new Error("Loan type is required");

  if (parsed.loanCategory === "portfolio") {
    const ineligible = findIneligiblePortfolioProperty(parsed.portfolioProperties);
    if (ineligible) {
      throw new Error(
        `${ineligible.streetAddress} is a 5+ unit or mixed-use property and can't be included in a portfolio loan — email that property to us separately.`
      );
    }
  }

  // No perpetual referral fees for repeat business from the same borrower —
  // only their first deal through a given affiliate's link counts. Matched
  // by borrower email since that's the one stable identifier the intake
  // form always collects.
  let referralFeeEligible = true;
  if (options.referredByAffiliateId && parsed.borrowerEmail) {
    const priorDeal = await db.query.deals.findFirst({
      where: and(
        eq(deals.referredByAffiliateId, options.referredByAffiliateId),
        eq(deals.borrowerEmail, parsed.borrowerEmail)
      ),
    });
    if (priorDeal) referralFeeEligible = false;
  }

  const borrowerName = `${parsed.firstName} ${parsed.lastName}`.trim();
  const propertyAddress =
    parsed.loanCategory === "portfolio"
      ? `Portfolio (${parsed.portfolioProperties.length} propert${parsed.portfolioProperties.length === 1 ? "y" : "ies"})`
      : formatAddress(
          parsed.streetAddress || (parsed.parcelId ? `Parcel #${parsed.parcelId}` : null),
          parsed.city,
          parsed.state,
          parsed.postalCode
        );

  const [deal] = await db
    .insert(deals)
    .values({
      borrowerName,
      borrowerEntityName: parsed.borrowerEntityName,
      borrowerPhone: parsed.borrowerPhone,
      borrowerEmail: parsed.borrowerEmail,
      propertyAddress,
      loanCategory: parsed.loanCategory as (typeof deals.loanCategory.enumValues)[number],
      loanAmountRequested: parsed.requestedLoanAmount ?? "0",
      purchasePrice: parsed.purchasePrice,
      assignedLoanOfficerId: options.assignedLoanOfficerId,
      assignedProcessorId: options.assignedProcessorId,
      assignedAssistantId: options.assignedAssistantId,
      source: parsed.source,
      referredByAffiliateId: options.referredByAffiliateId ?? null,
      referralFeeEligible,
      driveLink: options.driveLink,
      stage: "new",
      ...intakeToDealFields(parsed),
    })
    .returning({ id: deals.id });

  if (parsed.loanCategory === "portfolio" && parsed.portfolioProperties.length) {
    await db.insert(dealPortfolioProperties).values(
      parsed.portfolioProperties.map((p, i) => ({
        dealId: deal.id,
        streetAddress: p.streetAddress,
        city: p.city,
        state: p.state,
        postalCode: p.postalCode,
        propertyType: p.propertyType as (typeof dealPortfolioProperties.propertyType.enumValues)[number],
        purchasePrice: p.purchasePrice,
        estimatedAsIsValue: p.estimatedAsIsValue,
        currentRent: p.currentRent,
        annualTaxes: p.annualTaxes,
        annualInsurance: p.annualInsurance,
        annualHoa: p.annualHoa,
        rentalStrategy: p.rentalStrategy as (typeof dealPortfolioProperties.rentalStrategy.enumValues)[number] | null,
        currentOccupancy: p.currentOccupancy as (typeof dealPortfolioProperties.currentOccupancy.enumValues)[number] | null,
        sortOrder: i,
      }))
    );
  }

  await db.insert(dealStageHistory).values({
    dealId: deal.id,
    stage: "new",
    changedByUserId: options.stageChangedByUserId,
  });

  if (parsed.additionalNotes) {
    await db.insert(dealNotes).values({
      dealId: deal.id,
      authorUserId: options.noteAuthorUserId,
      source: "user",
      body: parsed.additionalNotes,
    });
  }

  if (options.referredByAffiliateId) {
    await notifyAffiliateOfNewDeal(deal.id).catch((err) => {
      console.error("Failed to send affiliate deal-submitted email:", err);
    });
  }

  await notifyAdminOfNewDeal(deal.id).catch((err) => {
    console.error("Failed to send admin new-deal notification:", err);
  });

  await notifyBorrowerOfSubmission(deal.id).catch((err) => {
    console.error("Failed to send borrower deal-received notification:", err);
  });

  return deal.id;
}

export async function updateDealDetails(dealId: string, formData: FormData) {
  await requireUser();

  const borrowerName = str(formData, "borrowerName");
  const propertyAddress = str(formData, "propertyAddress");
  const loanCategory = str(formData, "loanCategory");
  const loanAmountRequested = str(formData, "loanAmountRequested");
  if (!borrowerName) throw new Error("Borrower name is required");
  if (!propertyAddress) throw new Error("Property address is required");
  if (!loanCategory) throw new Error("Loan category is required");
  if (!loanAmountRequested) throw new Error("Loan amount is required");

  await db
    .update(deals)
    .set({
      borrowerName,
      borrowerEntityName: nullableStr(formData, "borrowerEntityName"),
      borrowerPhone: (() => {
        const raw = nullableStr(formData, "borrowerPhone");
        return raw ? toE164(raw) : null;
      })(),
      borrowerEmail: nullableStr(formData, "borrowerEmail"),
      propertyAddress,
      parcelId: nullableStr(formData, "parcelId"),
      loanCategory: loanCategory as (typeof deals.loanCategory.enumValues)[number],
      loanAmountRequested,
      purchasePrice: nullableStr(formData, "purchasePrice"),
      source: nullableStr(formData, "source"),

      estimatedFico: nullableInt(formData, "estimatedFico"),
      propertyType: nullableStr(formData, "propertyType") as
        | (typeof deals.propertyType.enumValues)[number]
        | null,
      unitCount: nullableInt(formData, "unitCount"),
      exitStrategy: nullableStr(formData, "exitStrategy") as
        | (typeof deals.exitStrategy.enumValues)[number]
        | null,
      numFlips: nullableInt(formData, "numFlips"),
      numRentals: nullableInt(formData, "numRentals"),
      numNewConstruction: nullableInt(formData, "numNewConstruction"),
      propertyAlreadyOwned: boolField(formData, "propertyAlreadyOwned"),
      propertyPurchaseDate: dateOrNull(formData, "propertyPurchaseDate"),
      didRehabSincePurchase: yesNoOrNull(formData, "didRehabSincePurchase"),
      estimatedRehabCost: nullableStr(formData, "estimatedRehabCost"),
      rehabDescription: nullableStr(formData, "rehabDescription"),
      estimatedArv: nullableStr(formData, "estimatedArv"),
      estimatedAsIsValue: nullableStr(formData, "estimatedAsIsValue"),
      estimatedAsIsLotValue: nullableStr(formData, "estimatedAsIsLotValue"),
      mortgagePayoffAmount: nullableStr(formData, "mortgagePayoffAmount"),
      propertyListedOnMarket: boolField(formData, "propertyListedOnMarket"),
      currentMonthlyMortgagePayment: nullableStr(formData, "currentMonthlyMortgagePayment"),
      currentRent: nullableStr(formData, "currentRent"),
      annualTaxes: nullableStr(formData, "annualTaxes"),
      annualInsurance: nullableStr(formData, "annualInsurance"),
      annualHoa: nullableStr(formData, "annualHoa"),
      rentalStrategy: nullableStr(formData, "rentalStrategy") as
        | (typeof deals.rentalStrategy.enumValues)[number]
        | null,
      currentOccupancy: nullableStr(formData, "currentOccupancy") as
        | (typeof deals.currentOccupancy.enumValues)[number]
        | null,
      estimatedClosingDate: dateOrNull(formData, "estimatedClosingDate"),
      rural: yesNoOrNull(formData, "rural"),
      maritalStatus: nullableStr(formData, "maritalStatus") as
        | (typeof deals.maritalStatus.enumValues)[number]
        | null,
      citizenship: nullableStr(formData, "citizenship") as
        | (typeof deals.citizenship.enumValues)[number]
        | null,
      mortgageLatesLast12mo: yesNoOrNull(formData, "mortgageLatesLast12mo"),
      taxLiensBkForeclosureLast24mo: yesNoOrNull(formData, "taxLiensBkForeclosureLast24mo"),
      borrowerLiquidity: nullableStr(formData, "borrowerLiquidity"),
      marketingConsent: boolField(formData, "marketingConsent"),

      updatedAt: new Date(),
    })
    .where(eq(deals.id, dealId));

  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/");
  revalidatePath("/dashboard");
}

export async function updateDealRoles(dealId: string, formData: FormData) {
  await requireUser();

  const assignedLoanOfficerId = str(formData, "assignedLoanOfficerId");
  if (!assignedLoanOfficerId) throw new Error("A loan officer must be assigned");

  await db
    .update(deals)
    .set({
      assignedLoanOfficerId,
      assignedProcessorId: nullableStr(formData, "assignedProcessorId"),
      assignedAssistantId: nullableStr(formData, "assignedAssistantId"),
      updatedAt: new Date(),
    })
    .where(eq(deals.id, dealId));

  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/");
  revalidatePath("/dashboard");
}

export async function addDealFollower(dealId: string, formData: FormData) {
  await requireUser();

  const name = str(formData, "name");
  const email = str(formData, "email");
  if (!name) throw new Error("Name is required");
  if (!email) throw new Error("Email is required");

  await db.insert(dealFollowers).values({
    dealId,
    name,
    email,
    phone: nullableStr(formData, "phone"),
    roleLabel: nullableStr(formData, "roleLabel"),
  });

  revalidatePath(`/deals/${dealId}`);
}

export async function updateDealFollower(dealId: string, followerId: string, formData: FormData) {
  await requireUser();

  const name = str(formData, "name");
  const email = str(formData, "email");
  if (!name) throw new Error("Name is required");
  if (!email) throw new Error("Email is required");

  await db
    .update(dealFollowers)
    .set({
      name,
      email,
      phone: nullableStr(formData, "phone"),
      roleLabel: nullableStr(formData, "roleLabel"),
    })
    .where(and(eq(dealFollowers.id, followerId), eq(dealFollowers.dealId, dealId)));

  revalidatePath(`/deals/${dealId}`);
}

export async function removeDealFollower(dealId: string, followerId: string) {
  await requireUser();
  await db.delete(dealFollowers).where(eq(dealFollowers.id, followerId));
  revalidatePath(`/deals/${dealId}`);
}

// Editing accepted terms now reuses the exact same field defs/parsing as the
// term sheet form itself (termSheetFieldsFor + extractTermSheetFields), so
// the two never disagree on what a field means or how it's typed. Anything
// NOT on the term sheet (appraised value/ARV, the LTV/LTARV/LTC appraised
// toggles, FICO, our own processing fee override) is handled separately
// below as "additional items."
export async function updateAcceptedTerms(dealId: string, formData: FormData) {
  await requireUser();

  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    with: { termSheets: true },
  });
  if (!deal) throw new Error("Deal not found");

  const acceptedTermSheet = deal.termSheets.find((t) => t.status === "accepted");
  const isHardMoneyDraw = HARD_MONEY_DRAW_CATEGORIES.has(deal.loanCategory);
  const termFields = extractTermSheetFields(formData, deal.loanCategory, false);

  const loanAmount = typeof termFields.loanAmount === "number" ? termFields.loanAmount : null;
  const rehabCost = typeof termFields.approvedRehabCost === "number" ? termFields.approvedRehabCost : null;
  const arv = typeof termFields.approvedArv === "number" ? termFields.approvedArv : null;

  const appraisedValue = nullableStr(formData, "appraisedValue");
  const ltvBasedOnPurchasePrice = boolField(formData, "ltvBasedOnPurchasePrice");
  const appraisedArv = nullableStr(formData, "appraisedArv");
  const ltarvBasedOnApprovedArv = boolField(formData, "ltarvBasedOnApprovedArv");

  // Same "use the appraised figure once it's in, otherwise the
  // purchase-price/quoted figure" logic performTermSheetAcceptance() uses
  // at acceptance time — just re-evaluated here against whatever's now on
  // hand (an appraisal or credit pull can change any of these later).
  const asIsBasis = ltvBasedOnPurchasePrice
    ? conservativeValueBasis(
        deal.loanCategory,
        deal.purchasePrice ? Number(deal.purchasePrice) : null,
        deal.estimatedAsIsValue ? Number(deal.estimatedAsIsValue) : null
      )
    : appraisedValue
      ? Number(appraisedValue)
      : null;
  const effectiveArv = ltarvBasedOnApprovedArv ? arv : appraisedArv ? Number(appraisedArv) : null;

  const approvedLtv = !isHardMoneyDraw && loanAmount && asIsBasis ? (loanAmount / asIsBasis) * 100 : null;
  const approvedLtarv = isHardMoneyDraw && loanAmount ? calculateLtarv(loanAmount, effectiveArv) : null;
  const approvedLtc = isHardMoneyDraw && loanAmount ? calculateLtc(loanAmount, asIsBasis, rehabCost) : null;

  await db
    .update(deals)
    .set({
      approvedLoanAmount: loanAmount !== null ? String(loanAmount) : null,
      finalRate: typeof termFields.interestRate === "number" ? String(termFields.interestRate) : null,
      finalAmortizationType: typeof termFields.amortizationType === "string" ? termFields.amortizationType : null,
      finalLoanTermYears: typeof termFields.loanTermYears === "number" ? termFields.loanTermYears : null,
      finalLoanTermMonths: typeof termFields.loanTermMonths === "number" ? termFields.loanTermMonths : null,
      originationPointsOverride:
        typeof termFields.originationPoints === "number" ? String(termFields.originationPoints) : null,
      rateBuydownPointsOverride:
        typeof termFields.rateBuydownPoints === "number" ? String(termFields.rateBuydownPoints) : null,
      costToBorrowerFee: typeof termFields.costToBorrowerFee === "number" ? String(termFields.costToBorrowerFee) : null,
      approvedRehabCost: rehabCost !== null ? String(rehabCost) : null,
      approvedArv: arv !== null ? String(arv) : null,
      approvedInitialAdvance:
        typeof termFields.initialAdvance === "number" ? String(termFields.initialAdvance) : null,
      interestType: typeof termFields.interestType === "string" ? termFields.interestType : null,
      appraisedValue,
      ltvBasedOnPurchasePrice,
      appraisedArv,
      ltarvBasedOnApprovedArv,
      approvedLtv: approvedLtv !== null ? String(approvedLtv) : null,
      approvedLtarv: approvedLtarv !== null ? String(approvedLtarv) : null,
      approvedLtc: approvedLtc !== null ? String(approvedLtc) : null,
      estimatedFico: nullableInt(formData, "estimatedFico"),
      processingFeeOverride: nullableStr(formData, "processingFeeOverride"),
      updatedAt: new Date(),
    })
    .where(eq(deals.id, dealId));

  // Optional: fold these same edits back into the accepted term sheet's own
  // fields so its PDF reflects the update — the whole point being a
  // processor can pull a fresh PDF after an appraisal/credit-pull change
  // without re-keying everything into a brand new term sheet.
  if (formData.get("regenerateTermSheet") === "on" && acceptedTermSheet) {
    await db
      .update(termSheets)
      .set({ fields: { ...acceptedTermSheet.fields, ...termFields } })
      .where(eq(termSheets.id, acceptedTermSheet.id));
  }

  // The processing fee (processingFeeOverride, set above) is the one field
  // here that can affect billing — refreshes the invoice if it changed and
  // nothing's been paid yet. Never throws; see src/server/billing.ts.
  await syncProcessingFeeInvoice(dealId);

  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/");
  revalidatePath("/dashboard");
}

export async function toggleRateLock(dealId: string, locked: boolean) {
  await requireUser();

  await db
    .update(deals)
    .set({
      rateLocked: locked,
      rateLockedAt: locked ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(deals.id, dealId));

  revalidatePath(`/deals/${dealId}`);
}

export async function updateDealDates(dealId: string, formData: FormData) {
  await requireUser();

  function dateOrNull(key: string) {
    const value = str(formData, key);
    return value ? new Date(value) : null;
  }

  await db
    .update(deals)
    .set({
      creditPullDate: dateOrNull("creditPullDate"),
      driveLink: nullableStr(formData, "driveLink"),
      updatedAt: new Date(),
    })
    .where(eq(deals.id, dealId));

  revalidatePath(`/deals/${dealId}`);
}

const MAX_APPRAISAL_FILE_SIZE = 15 * 1024 * 1024; // 15MB, matches the borrower-upload limit

export async function uploadAppraisalDocument(dealId: string, formData: FormData) {
  await requireUser();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose a file first");
  if (file.size > MAX_APPRAISAL_FILE_SIZE) throw new Error(`${file.name} is too large (15MB max)`);

  await db
    .update(deals)
    .set({
      appraisalDocumentFileName: file.name,
      appraisalDocumentMimeType: file.type || "application/octet-stream",
      appraisalDocumentData: Buffer.from(await file.arrayBuffer()).toString("base64"),
      updatedAt: new Date(),
    })
    .where(eq(deals.id, dealId));

  revalidatePath(`/deals/${dealId}`);
}

export async function deleteAppraisalDocument(dealId: string) {
  await requireUser();
  await db
    .update(deals)
    .set({ appraisalDocumentFileName: null, appraisalDocumentMimeType: null, appraisalDocumentData: null })
    .where(eq(deals.id, dealId));
  revalidatePath(`/deals/${dealId}`);
}

// Writes the AI scan's reviewed values onto the deal — the same
// appraisedValue/appraisedArv columns the accepted-terms edit dialog
// already reads/writes, so whichever path sets them last wins. Only
// touches a field the caller actually included, so applying just one of
// the two (e.g. the ARV was misread and cleared in review) leaves the
// other alone. Deliberately doesn't touch market rent — see
// extractAppraisalData's own comment, there's no home for it on the deal
// yet.
export async function applyAppraisalExtraction(dealId: string, formData: FormData) {
  await requireUser();

  const updates: Record<string, string | null> = {};
  if (formData.has("appraisedValue")) updates.appraisedValue = nullableStr(formData, "appraisedValue");
  if (formData.has("appraisedArv")) updates.appraisedArv = nullableStr(formData, "appraisedArv");
  if (!Object.keys(updates).length) return;

  await db
    .update(deals)
    .set(updates)
    .where(eq(deals.id, dealId));

  revalidatePath(`/deals/${dealId}`);
}

// Automatic forward-progression hook for a handful of specific staff/system
// actions (pricing a loan, generating a term sheet PDF, sending it to the
// borrower, the processing-fee invoice getting paid) — see each call site.
// The `where stage = fromStage` guard makes this safe to call from a
// webhook with no session and idempotent against retries/double-clicks: if
// the deal has already moved on (by this same trigger firing twice, or a
// staffer manually changing the stage themselves), it's a no-op rather than
// a regression or a duplicate notification. `changedByUserId` is null for
// the one webhook-triggered case (invoice paid — no signed-in user).
export async function advanceDealStage(
  dealId: string,
  fromStage: (typeof dealStageEnum.enumValues)[number],
  toStage: (typeof dealStageEnum.enumValues)[number],
  changedByUserId: string | null
): Promise<boolean> {
  const [updated] = await db
    .update(deals)
    .set({ stage: toStage, updatedAt: new Date() })
    .where(and(eq(deals.id, dealId), eq(deals.stage, fromStage)))
    .returning({ id: deals.id });
  if (!updated) return false;

  await db.insert(dealStageHistory).values({ dealId, stage: toStage, changedByUserId });
  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath(`/deals/${dealId}`);
  return true;
}

// The one place a deal's stage ever changes via direct staff choice (header
// dropdown + kanban drag-and-drop both call this) — distinct from
// advanceDealStage above, which is for automatic forward progression only.
// On Hold/Follow-up/Lost/Disqualified all require a reason — the UI is
// expected to have already collected it via StageReasonDialog before
// calling this, but it's re-validated here too since this is a callable
// server action.
export async function updateDealStage(dealId: string, stage: string, reason?: string, confirmed?: boolean) {
  const user = await requireUser();
  if (!dealStageEnum.enumValues.includes(stage as (typeof dealStageEnum.enumValues)[number])) {
    throw new Error("Invalid stage");
  }
  const newStage = stage as (typeof dealStageEnum.enumValues)[number];

  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) throw new Error("Deal not found");

  const trimmedReason = reason?.trim() || "";
  if (STAGES_REQUIRING_REASON.has(newStage) && !trimmedReason) {
    throw new Error("A reason is required for this stage change");
  }
  // Closing feeds directly into revenue/performance metrics, so it needs an
  // explicit "yes" — checked server-side too, not just in the dialog, since
  // this is called directly (not via a form) and a client bug could
  // otherwise skip the confirmation entirely.
  if (STAGES_REQUIRING_CONFIRMATION.has(newStage) && deal.stage !== newStage && !confirmed) {
    throw new Error("Marking a deal as Closed requires confirmation");
  }

  const updates: Partial<typeof deals.$inferInsert> = { stage: newStage, updatedAt: new Date() };

  if (PAUSED_STAGES.has(newStage)) {
    updates.pauseReason = trimmedReason;
    updates.pausedAt = new Date();
    // Anchor to the last real stage — moving between on_hold and follow_up
    // directly shouldn't lose track of what stage to resume/dim to, and
    // moving straight from Lost/Disqualified shouldn't anchor to those
    // (they're not real pipeline stages) so fall back to the start.
    updates.pausedFromStage = PAUSED_STAGES.has(deal.stage)
      ? deal.pausedFromStage
      : isPipelineStage(deal.stage)
        ? deal.stage
        : "new";
  } else if (TERMINAL_NEGATIVE_STAGES.has(newStage)) {
    if (newStage === "lost") updates.lostReason = trimmedReason;
    if (newStage === "disqualified") updates.disqualifiedReason = trimmedReason;
    updates.pauseReason = null;
    updates.pausedFromStage = null;
    updates.pausedAt = null;
  } else {
    // Resuming to a real stage — archive the pause reason as a permanent
    // note instead of just discarding it.
    if (PAUSED_STAGES.has(deal.stage) && deal.pauseReason) {
      await db.insert(dealNotes).values({
        dealId,
        authorUserId: user.id,
        source: "system",
        body: `${deal.stage === "on_hold" ? "On Hold" : "Follow-up"} reason (resolved): ${deal.pauseReason}`,
      });
    }
    updates.pauseReason = null;
    updates.pausedFromStage = null;
    updates.pausedAt = null;
  }

  await db.update(deals).set(updates).where(eq(deals.id, dealId));

  await db.insert(dealStageHistory).values({
    dealId,
    stage: newStage,
    changedByUserId: user.id,
  });

  if (deal.referredByAffiliateId) {
    await notifyAffiliateOfStageChange(dealId, newStage).catch((err) => {
      console.error("Failed to send affiliate stage-change email:", err);
    });
  }

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath(`/deals/${dealId}`);
}

export async function addDealNote(dealId: string, formData: FormData) {
  const user = await requireUser();
  const body = str(formData, "body");
  if (!body) return;

  await db.insert(dealNotes).values({
    dealId,
    authorUserId: user.id,
    source: "user",
    body,
  });

  revalidatePath(`/deals/${dealId}`);
}

export async function resolveDealNote(dealId: string, noteId: string) {
  await requireUser();
  await db.update(dealNotes).set({ resolved: true }).where(eq(dealNotes.id, noteId));
  revalidatePath(`/deals/${dealId}`);
}

// Only the note's own author or an admin can delete it — enforced here, not
// just hidden in the UI, since the delete button's visibility is only ever
// a convenience, never the actual guard.
export async function deleteDealNote(dealId: string, noteId: string) {
  const user = await requireUser();
  const note = await db.query.dealNotes.findFirst({ where: eq(dealNotes.id, noteId) });
  if (!note || note.dealId !== dealId) throw new Error("Note not found");
  if (note.authorUserId !== user.id && !user.isAdmin) {
    throw new Error("You can only delete your own notes");
  }

  await db.delete(dealNotes).where(eq(dealNotes.id, noteId));
  revalidatePath(`/deals/${dealId}`);
  revalidatePath(`/deals/${dealId}/loan-center`);
}

export async function updateClientNeedsReminderSettings(
  dealId: string,
  intervalHours: number,
  paused: boolean
) {
  await requireUser();
  if (!CLIENT_NEEDS_REMINDER_INTERVAL_HOURS.includes(intervalHours as (typeof CLIENT_NEEDS_REMINDER_INTERVAL_HOURS)[number])) {
    throw new Error("Invalid reminder interval");
  }
  await db
    .update(deals)
    .set({ clientNeedsReminderIntervalHours: intervalHours, clientNeedsRemindersPaused: paused })
    .where(eq(deals.id, dealId));
  revalidatePath(`/deals/${dealId}/loan-center`);
}

/** Returns the deal's borrower-upload link, generating its token on first use. */
export async function getOrCreateBorrowerUploadLink(dealId: string): Promise<string> {
  await requireUser();
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) throw new Error("Deal not found");

  let token = deal.borrowerUploadToken;
  if (!token) {
    token = crypto.randomUUID();
    await db.update(deals).set({ borrowerUploadToken: token }).where(eq(deals.id, dealId));
  }

  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
  return `${baseUrl}/borrower-upload/${token}`;
}

// Independent of the Title Info / Insurance Contact Info client needs —
// "Mark Accepted" on one of those auto-fills these once (see
// markNonDocumentNeedAccepted), but a processor can also edit them directly
// any time: gathered over the phone, the client need got deleted, or the
// contact changed mid-deal.
export async function updateTitleContact(dealId: string, formData: FormData) {
  await requireUser();
  await db
    .update(deals)
    .set({
      titleCompanyAgentName: nullableStr(formData, "titleCompanyAgentName"),
      titleCompanyName: nullableStr(formData, "titleCompanyName"),
      titleAgentEmail: nullableStr(formData, "titleAgentEmail"),
      titleAgentPhone: nullableStr(formData, "titleAgentPhone"),
    })
    .where(eq(deals.id, dealId));
  revalidatePath(`/deals/${dealId}/loan-center`);
}

export async function updateInsuranceContact(dealId: string, formData: FormData) {
  await requireUser();
  await db
    .update(deals)
    .set({
      insuranceAgency: nullableStr(formData, "insuranceAgency"),
      insuranceAgentName: nullableStr(formData, "insuranceAgentName"),
      insuranceAgentEmail: nullableStr(formData, "insuranceAgentEmail"),
      insuranceAgentPhone: nullableStr(formData, "insuranceAgentPhone"),
      insuranceContactNotes: nullableStr(formData, "insuranceContactNotes"),
    })
    .where(eq(deals.id, dealId));
  revalidatePath(`/deals/${dealId}/loan-center`);
}

// Whoever will let the appraiser into the property — same "one shared spot,
// several possible sources" pattern as Title/Insurance above, just newer:
// see the 2026-09-24 project notes on the CV3 DSCR Purchase custom form.
export async function updateInteriorAccessContact(dealId: string, formData: FormData) {
  await requireUser();
  await db
    .update(deals)
    .set({
      interiorAccessContactRelationship: nullableStr(formData, "interiorAccessContactRelationship"),
      interiorAccessContactName: nullableStr(formData, "interiorAccessContactName"),
      interiorAccessContactEmail: nullableStr(formData, "interiorAccessContactEmail"),
      interiorAccessContactPhone: nullableStr(formData, "interiorAccessContactPhone"),
      interiorAccessLockBoxInfo: nullableStr(formData, "interiorAccessLockBoxInfo"),
    })
    .where(eq(deals.id, dealId));
  revalidatePath(`/deals/${dealId}/loan-center`);
}

// Any signed-in user can delete — the real safeguard is typing the word
// DELETE (re-checked here, not just enforced client-side) plus the fact
// that nobody but an admin can see or undo it afterward (see
// restoreDeletedDeal). Soft delete only; purgeExpiredDeletedDeals is what
// actually removes the row, DELETED_DEAL_PURGE_AFTER_DAYS later.
export async function deleteDeal(dealId: string, confirmText: string) {
  const user = await requireUser();
  if (confirmText.trim() !== "DELETE") {
    throw new Error('Type "DELETE" exactly to confirm.');
  }

  await db
    .update(deals)
    .set({ deletedAt: new Date(), deletedByUserId: user.id })
    .where(eq(deals.id, dealId));

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/pipeline");
}

// Admin-only, by design — see the column comment on deals.deletedAt.
export async function restoreDeletedDeal(dealId: string) {
  await requireAdmin();
  await db
    .update(deals)
    .set({ deletedAt: null, deletedByUserId: null })
    .where(eq(deals.id, dealId));

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/pipeline");
  revalidatePath(`/deals/${dealId}`);
}

// Only reachable from Closed or Lost — a deal has to actually be done,
// successfully or not, before it's archived. Fully reversible (see
// restoreArchivedDeal), unlike deleteDeal.
export async function archiveDeal(dealId: string) {
  const user = await requireUser();
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) throw new Error("Deal not found");
  if (!ARCHIVABLE_STAGES.has(deal.stage)) {
    throw new Error("Only a Closed or Lost deal can be archived.");
  }

  await db
    .update(deals)
    .set({ archivedAt: new Date(), archivedByUserId: user.id })
    .where(eq(deals.id, dealId));

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/pipeline");
  revalidatePath("/pipeline/archived");
}

// Any signed-in user — archiving carries no data risk, so unlike deleting
// there's no reason to gate who can undo it. Opening an archived deal does
// NOT do this automatically; it's always a deliberate, separate action.
export async function restoreArchivedDeal(dealId: string) {
  await requireUser();
  await db
    .update(deals)
    .set({ archivedAt: null, archivedByUserId: null })
    .where(eq(deals.id, dealId));

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/pipeline");
  revalidatePath("/pipeline/archived");
  revalidatePath(`/deals/${dealId}`);
}
