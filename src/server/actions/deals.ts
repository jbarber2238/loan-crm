"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CLIENT_NEEDS_REMINDER_INTERVAL_HOURS } from "@/lib/client-needs-reminders";
import { db } from "@/server/db/client";
import {
  dealFollowers,
  dealNotes,
  dealPortfolioProperties,
  dealStageEnum,
  dealStageHistory,
  deals,
} from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { formatAddress } from "@/lib/format";
import { PAUSED_STAGES, TERMINAL_NEGATIVE_STAGES, STAGES_REQUIRING_REASON, isPipelineStage } from "@/lib/deal-pipeline";
import {
  findIneligiblePortfolioProperty,
  intakeToDealFields,
  parseIntakeFormData,
} from "@/server/actions/parse-intake";

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

  revalidatePath("/");
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
      borrowerPhone: nullableStr(formData, "borrowerPhone"),
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
    roleLabel: nullableStr(formData, "roleLabel"),
  });

  revalidatePath(`/deals/${dealId}`);
}

export async function removeDealFollower(dealId: string, followerId: string) {
  await requireUser();
  await db.delete(dealFollowers).where(eq(dealFollowers.id, followerId));
  revalidatePath(`/deals/${dealId}`);
}

export async function updateAcceptedTerms(dealId: string, formData: FormData) {
  await requireUser();

  await db
    .update(deals)
    .set({
      approvedLoanAmount: nullableStr(formData, "approvedLoanAmount"),
      approvedLtv: nullableStr(formData, "approvedLtv"),
      appraisedValue: nullableStr(formData, "appraisedValue"),
      ltvBasedOnPurchasePrice: boolField(formData, "ltvBasedOnPurchasePrice"),
      finalRate: nullableStr(formData, "finalRate"),
      estimatedFico: nullableInt(formData, "estimatedFico"),
      costToBorrowerFee: nullableStr(formData, "costToBorrowerFee"),
      processingFeeOverride: nullableStr(formData, "processingFeeOverride"),
      finalAmortizationType: nullableStr(formData, "finalAmortizationType"),
      finalLoanTermYears: nullableInt(formData, "finalLoanTermYears"),
      updatedAt: new Date(),
    })
    .where(eq(deals.id, dealId));

  revalidatePath(`/deals/${dealId}`);
  revalidatePath("/");
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
      appraisalOrderedDate: dateOrNull("appraisalOrderedDate"),
      creditPullDate: dateOrNull("creditPullDate"),
      insuranceContactedDate: dateOrNull("insuranceContactedDate"),
      titleOrderedDate: dateOrNull("titleOrderedDate"),
      driveLink: nullableStr(formData, "driveLink"),
      updatedAt: new Date(),
    })
    .where(eq(deals.id, dealId));

  revalidatePath(`/deals/${dealId}`);
}

// The one place a deal's stage ever changes (header dropdown + kanban
// drag-and-drop both call this). On Hold/Follow-up/Lost/Disqualified all
// require a reason — the UI is expected to have already collected it via
// StageReasonDialog before calling this, but it's re-validated here too
// since this is a callable server action.
export async function updateDealStage(dealId: string, stage: string, reason?: string) {
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

  revalidatePath("/");
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

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
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
    })
    .where(eq(deals.id, dealId));
  revalidatePath(`/deals/${dealId}/loan-center`);
}
