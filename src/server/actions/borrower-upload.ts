"use server";

import { PAUSED_STAGES, TERMINAL_NEGATIVE_STAGES, hasReachedStage } from "@/lib/deal-pipeline";
import { buildBorrowerKeyDates } from "@/lib/borrower-key-dates";
import { and, eq, isNull, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { deals, dealClientNeeds, dealClientNeedDocuments, dealClientNeedAnswers, dealKeyDateEvents } from "@/server/db/schema";
import { recomputeNeedStatus } from "@/server/client-need-status";
import { recordBorrowerActivity } from "@/server/borrower-activity";
import { convertHeicIfNeeded } from "@/server/heic";
import { rejectedDocumentsToMention } from "@/server/client-needs-email-format";
import { createSigningSessionUrl } from "@/server/pandadoc";
import { parsePropertyAddress } from "@/lib/format";
import { getCustomFormDefinition, syncedFieldsFor } from "@/lib/custom-need-forms/registry";
import { collectCustomFormAnswers, MAX_DRAFT_ANSWER_CHARS } from "@/lib/custom-need-forms/answers";
import { fail, type ActionError } from "@/lib/action-result";
import { resolveStagedFiles } from "@/server/staged-uploads";
import { BORROWER_MAX_FILE_BYTES, formatMb } from "@/lib/upload-limits";

const MAX_FILE_SIZE = BORROWER_MAX_FILE_BYTES;

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

export interface BorrowerUploadAnswer {
  id: string;
  questionText: string;
  required: boolean;
  answerText: string | null;
}

export interface BorrowerUploadNeed {
  id: string;
  itemName: string;
  description: string | null;
  needType: "document_upload" | "esign" | "questionnaire" | "link" | "pandadoc_form" | "custom_form";
  status:
    | "not_sent"
    | "awaiting_docs"
    | "review_needed"
    | "accepted"
    | "document_rejected_not_sent"
    | "need_rejected_not_sent";
  minFiles: number;
  linkUrl: string | null;
  templateFileName: string | null;
  pandadocDocumentId: string | null;
  customFormKey: string | null;
  // The borrower has started this form and saved their progress, but hasn't submitted it.
  hasFormDraft: boolean;
  rejectionNotes: string[];
  answers: BorrowerUploadAnswer[];
}

/**
 * Public lookup by the unguessable per-deal token — no auth. Only ever
 * returns outstanding needs and never a file id/name/download link, so
 * nothing on this surface can be used to view or download a document.
 */
export async function getDealForBorrowerUpload(token: string) {
  const deal = await db.query.deals.findFirst({
    where: eq(deals.borrowerUploadToken, token),
  });
  if (!deal) return null;

  const needs = await db.query.dealClientNeeds.findMany({
    // Needs on hold, or marked unused, are hidden from the borrower entirely.
    where: and(
      eq(dealClientNeeds.dealId, deal.id),
      isNull(dealClientNeeds.onHoldAt),
      ne(dealClientNeeds.status, "unused")
    ),
    columns: { templateFileData: false },
    with: {
      documents: { columns: { reviewStatus: true, rejectionNote: true, createdAt: true } },
      answers: {
        columns: { id: true, questionText: true, required: true, answerText: true },
        orderBy: (a, { asc }) => asc(a.sortOrder),
      },
    },
    orderBy: (n, { asc }) => asc(n.sortOrder),
  });

  // Every need comes back now, accepted ones included — the page groups them
  // by status (needed, submitted, accepted) so the borrower can see progress
  // toward completion rather than having finished items just disappear.
  const allNeeds: BorrowerUploadNeed[] = needs.map((n) => ({
    id: n.id,
    itemName: n.itemName,
    description: n.description,
    needType: n.needType,
    // The query already excludes status "unused" above — this narrows the
    // type to match, since Drizzle can't express that from a `where` clause.
    status: n.status as BorrowerUploadNeed["status"],
    minFiles: n.minFiles,
    linkUrl: n.linkUrl,
    templateFileName: n.templateFileName,
    pandadocDocumentId: n.pandadocDocumentId,
    customFormKey: n.customFormKey,
    hasFormDraft: Boolean(n.customFormDraft) && !n.customFormSubmittedAt,
    // Several files rejected with the same reason read it once.
    rejectionNotes: [
      ...new Set(
        rejectedDocumentsToMention(n)
          .filter((d) => d.rejectionNote)
          .map((d) => d.rejectionNote!)
      ),
    ],
    answers: n.answers,
  }));

  const pipelineStage = PAUSED_STAGES.has(deal.stage) ? (deal.pausedFromStage ?? "new") : deal.stage;

  // Key dates (appraisal, insurance, title, credit pull) only show once the
  // file is past application intake — before then there's nothing to track.
  const showKeyDates = !TERMINAL_NEGATIVE_STAGES.has(deal.stage) && hasReachedStage(pipelineStage, "initial_app_review");
  const keyDates = showKeyDates
    ? buildBorrowerKeyDates(
        (
          await db.query.dealKeyDateEvents.findMany({
            where: eq(dealKeyDateEvents.dealId, deal.id),
          })
        ).map((e) => ({
          id: e.id,
          item: e.item,
          status: e.status,
          eventDate: e.eventDate,
          createdAt: e.createdAt,
          createdByName: null,
        })),
        deal.creditPullDate
      )
    : null;

  return {
    dealId: deal.id,
    borrowerFirstName: firstName(deal.borrowerName),
    propertyAddress: deal.propertyAddress,
    loanNumber: deal.loanNumber,
    // Only the pipeline position is exposed — never the pause/lost/
    // disqualified reasons, and paused deals just show where they left off.
    pipelineStage,
    showPipeline: !TERMINAL_NEGATIVE_STAGES.has(deal.stage),
    keyDates,
    needs: allNeeds,
  };
}

/**
 * A fresh signing-session URL for the borrower to fill/sign a PandaDoc
 * form — generated on demand (sessions are short-lived) when they click
 * "Fill out" rather than stored ahead of time. Still token-gated: only
 * works for a need that actually belongs to the deal this token unlocks.
 */
export async function getPandaDocSigningUrl(token: string, needId: string): Promise<string> {
  const deal = await db.query.deals.findFirst({ where: eq(deals.borrowerUploadToken, token) });
  if (!deal) throw new Error("This link is no longer valid");

  const need = await db.query.dealClientNeeds.findFirst({
    where: and(eq(dealClientNeeds.id, needId), eq(dealClientNeeds.dealId, deal.id)),
  });
  if (!need || need.needType !== "pandadoc_form" || !need.pandadocDocumentId) {
    throw new Error("This form isn't ready yet — check back shortly or reach out to your loan officer");
  }
  if (!deal.borrowerEmail) throw new Error("No borrower email is on file for this deal");

  return createSigningSessionUrl(need.pandadocDocumentId, deal.borrowerEmail);
}

/**
 * Borrower-side upload — token-gated instead of requireUser().
 *
 * Reasons a borrower can fix come back as `{ error }` instead of being thrown: in production a thrown message is
 * replaced by React's generic "error #441" text, so the borrower would never learn that, say, a file was too big.
 */
export async function uploadBorrowerDocument(token: string, needId: string, formData: FormData): Promise<{ error: string } | { ok: true }> {
  const deal = await db.query.deals.findFirst({ where: eq(deals.borrowerUploadToken, token) });
  if (!deal) return { error: "This link is no longer valid." };

  const need = await db.query.dealClientNeeds.findFirst({
    where: and(eq(dealClientNeeds.id, needId), eq(dealClientNeeds.dealId, deal.id)),
    columns: { id: true, needType: true, status: true, sentAt: true, itemName: true },
  });
  if (!need || need.needType !== "document_upload" || need.status === "accepted") {
    return { error: "This item can't accept an upload right now." };
  }

  try {
    await resolveStagedFiles(formData);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "That upload couldn't be read. Please try again." };
  }
  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { error: "Choose at least one file to upload." };
  const tooLarge = files.find((f) => f.size > MAX_FILE_SIZE);
  if (tooLarge) {
    return { error: `${tooLarge.name} is ${formatMb(tooLarge.size)}, over our ${formatMb(MAX_FILE_SIZE)} limit. Please save it smaller or split it into two files.` };
  }

  for (const file of files) {
    const original = Buffer.from(await file.arrayBuffer()).toString("base64");
    let stored;
    try {
      stored = await convertHeicIfNeeded({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        dataBase64: original,
      });
    } catch (err) {
      console.error("Borrower upload: couldn't convert a photo:", err);
      return { error: `We couldn't read ${file.name}. Please send it as a PDF or JPG instead.` };
    }
    await db.insert(dealClientNeedDocuments).values({
      clientNeedId: needId,
      fileName: stored.fileName,
      mimeType: stored.mimeType,
      fileSize: Buffer.byteLength(stored.dataBase64, "base64"),
      data: stored.dataBase64,
      uploadedByUserId: null,
    });
  }

  if (!need.sentAt) {
    await db.update(dealClientNeeds).set({ sentAt: new Date() }).where(eq(dealClientNeeds.id, needId));
  }
  await recomputeNeedStatus(needId);

  // The upload itself already succeeded and is the important part — never
  // fail the borrower's request over a notification email hiccup.
  try {
    await recordBorrowerActivity(deal.id, needId, need.itemName, "upload");
  } catch (err) {
    console.error("Failed to record borrower activity:", err);
  }

  revalidatePath(`/borrower-upload/${token}`);
  revalidatePath(`/deals/${deal.id}/loan-center`);
  return { ok: true };
}

/**
 * Borrower-side questionnaire submission — token-gated. Sets the need to
 * review_needed so it shows up for a processor to check over before they
 * click "Mark Accepted" (the same manual acceptance button already used for
 * esign/questionnaire needs).
 */
export async function submitClientNeedAnswers(token: string, needId: string, formData: FormData) {
  const deal = await db.query.deals.findFirst({ where: eq(deals.borrowerUploadToken, token) });
  if (!deal) throw new Error("This link is no longer valid");

  const need = await db.query.dealClientNeeds.findFirst({
    where: and(eq(dealClientNeeds.id, needId), eq(dealClientNeeds.dealId, deal.id)),
    with: { answers: true },
  });
  if (!need || need.needType !== "questionnaire" || need.status === "accepted") {
    throw new Error("This item can't accept a submission right now");
  }
  if (!need.answers.length) throw new Error("This item has no questions to answer");

  const answered = need.answers.filter((a) => {
    const value = formData.get(`answer-${a.id}`);
    return typeof value === "string" && value.trim().length > 0;
  });
  if (!answered.length) throw new Error("Please fill in at least one field");
  const missingRequired = need.answers.filter((a) => {
    if (!a.required) return false;
    const value = formData.get(`answer-${a.id}`);
    return typeof value !== "string" || !value.trim();
  });
  if (missingRequired.length) {
    throw new Error(`Please answer: ${missingRequired.map((a) => a.questionText).join("; ")}`);
  }

  const now = new Date();
  for (const a of need.answers) {
    const value = formData.get(`answer-${a.id}`);
    const trimmed = typeof value === "string" ? value.trim() : "";
    await db
      .update(dealClientNeedAnswers)
      .set({ answerText: trimmed || null, answeredAt: trimmed ? now : null })
      .where(eq(dealClientNeedAnswers.id, a.id));
  }

  await db
    .update(dealClientNeeds)
    .set({ status: "review_needed", sentAt: need.sentAt ?? now })
    .where(eq(dealClientNeeds.id, needId));

  try {
    await recordBorrowerActivity(deal.id, needId, need.itemName, "questionnaire");
  } catch (err) {
    console.error("Failed to record borrower activity:", err);
  }

  revalidatePath(`/borrower-upload/${token}`);
  revalidatePath(`/deals/${deal.id}/loan-center`);
}

function strOrEmpty(value: string | number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

// One-off convenience prefills shared by both CV3 forms (not written back to
// the deal, just a nicer starting point than a blank field) — separate from
// the generic syncDealField mechanism, which handles the fields that really
// are the same shared piece of data (see registry.ts's syncedFieldsFor).
function cv3ConvenienceDefaults(deal: typeof deals.$inferSelect): Record<string, string> {
  const [firstName, ...rest] = deal.borrowerName.trim().split(/\s+/);
  const address = parsePropertyAddress(deal.propertyAddress);
  return {
    borrowerLegalFirstName: firstName ?? "",
    borrowerLegalLastName: rest.join(" "),
    borrowerCellPhone: deal.borrowerPhone ?? "",
    borrowerEmail: deal.borrowerEmail ?? "",
    entityName: deal.borrowerEntityName ?? "",
    propertyStreet: address.street,
    propertyCity: address.city,
    propertyState: address.state,
    propertyZip: address.postalCode,
    monthlyRentalIncome: deal.currentRent ?? "",
    annualPropertyTaxesAmount: deal.annualTaxes ?? "",
    annualInsuranceAndFloodAmount: deal.annualInsurance ?? "",
  };
}

/**
 * Loads what the /borrower-upload/[token]/form/[needId] page needs to
 * render a custom_form need — the form definition's key plus a
 * defaultValues map built from (a) whichever shared deal fields this form's
 * fields sync with, (b) a few one-off convenience prefills, and (c) any
 * previously-submitted answers, in that priority order (later overrides
 * earlier), so a returning borrower sees their own prior answers first,
 * still-current deal data second, and blank last.
 */
export async function getCustomFormNeed(token: string, needId: string) {
  const deal = await db.query.deals.findFirst({ where: eq(deals.borrowerUploadToken, token) });
  if (!deal) return null;

  const need = await db.query.dealClientNeeds.findFirst({
    where: and(eq(dealClientNeeds.id, needId), eq(dealClientNeeds.dealId, deal.id)),
  });
  if (!need || need.needType !== "custom_form" || !need.customFormKey) return null;

  const definition = getCustomFormDefinition(need.customFormKey);
  if (!definition) return null;

  const defaultValues: Record<string, string> = {};
  if (need.customFormKey === "cv3_dscr_purchase" || need.customFormKey === "cv3_dscr_refinance") {
    Object.assign(defaultValues, cv3ConvenienceDefaults(deal));
  }
  for (const { name, dealField } of syncedFieldsFor(definition)) {
    const value = (deal as unknown as Record<string, unknown>)[dealField];
    if (typeof value === "string" || typeof value === "number") {
      defaultValues[name] = strOrEmpty(value);
    }
  }
  if (need.customFormData) {
    Object.assign(defaultValues, need.customFormData);
  }
  // Unsubmitted work in progress wins over everything: it is the borrower's latest typing.
  if (need.customFormDraft) {
    Object.assign(defaultValues, need.customFormDraft);
  }

  return {
    need: {
      id: need.id,
      itemName: need.itemName,
      description: need.description,
      status: need.status,
      customFormKey: need.customFormKey,
    },
    dealSummary: { propertyAddress: deal.propertyAddress, loanNumber: deal.loanNumber },
    defaultValues,
    draftSavedAt: need.customFormDraft ? need.customFormDraftSavedAt : null,
  };
}

/**
 * Saves what the borrower has typed so far, without submitting. The application is long, so they can leave and pick
 * it up from the same link. Nothing is required here, the need's status doesn't change, and the loan team sees
 * nothing until the real submit.
 */
export async function saveCustomFormDraft(
  token: string,
  needId: string,
  formData: FormData
): Promise<{ savedAt: string } | ActionError> {
  const deal = await db.query.deals.findFirst({ where: eq(deals.borrowerUploadToken, token) });
  if (!deal) return fail("This link is no longer valid.");

  const need = await db.query.dealClientNeeds.findFirst({
    where: and(eq(dealClientNeeds.id, needId), eq(dealClientNeeds.dealId, deal.id)),
    columns: { id: true, needType: true, customFormKey: true, status: true },
  });
  if (!need || need.needType !== "custom_form" || !need.customFormKey || need.status === "accepted") {
    return fail("This application can't be saved right now.");
  }

  const definition = getCustomFormDefinition(need.customFormKey);
  if (!definition) return fail("This form isn't set up correctly — reach out to your loan officer.");

  const answers = collectCustomFormAnswers(definition, (name) => formData.get(name), MAX_DRAFT_ANSWER_CHARS);
  const now = new Date();
  await db
    .update(dealClientNeeds)
    .set({ customFormDraft: answers, customFormDraftSavedAt: now })
    .where(eq(dealClientNeeds.id, needId));
  return { savedAt: now.toISOString() };
}

/**
 * Borrower-side custom_form submission — token-gated, same shape as
 * submitClientNeedAnswers but for the richly-typed form instead of plain
 * free-text questions. Everything submitted is stored as one JSONB blob;
 * fields the form definition marks with syncDealField are additionally
 * written back onto the deal itself (see registry.ts), so — same as the
 * existing Title/Insurance Contact client needs — whichever surface
 * collects this information first is the one that sticks everywhere else.
 */
export async function submitCustomFormAnswers(token: string, needId: string, formData: FormData) {
  const deal = await db.query.deals.findFirst({ where: eq(deals.borrowerUploadToken, token) });
  if (!deal) throw new Error("This link is no longer valid");

  const need = await db.query.dealClientNeeds.findFirst({
    where: and(eq(dealClientNeeds.id, needId), eq(dealClientNeeds.dealId, deal.id)),
  });
  if (!need || need.needType !== "custom_form" || !need.customFormKey || need.status === "accepted") {
    throw new Error("This item can't accept a submission right now");
  }

  const definition = getCustomFormDefinition(need.customFormKey);
  if (!definition) throw new Error("This form isn't set up correctly — reach out to your loan officer");

  const allFields = definition.sections.flatMap((s) => s.fields);
  const answers = collectCustomFormAnswers(definition, (name) => formData.get(name));

  const requiredMissing = allFields.filter((f) => {
    if (f.optional) return false;
    if (f.showIf && answers[f.showIf.field] !== f.showIf.equals) return false; // not applicable right now
    return !answers[f.name];
  });
  if (requiredMissing.length) {
    throw new Error(`Please fill in: ${requiredMissing.map((f) => f.label).join(", ")}`);
  }

  const now = new Date();
  await db
    .update(dealClientNeeds)
    .set({
      customFormData: answers,
      customFormSubmittedAt: now,
      customFormDraft: null,
      customFormDraftSavedAt: null,
      status: "review_needed",
      sentAt: need.sentAt ?? now,
    })
    .where(eq(dealClientNeeds.id, needId));

  const dealUpdates: Record<string, string> = {};
  for (const { name, dealField } of syncedFieldsFor(definition)) {
    if (answers[name]) dealUpdates[dealField] = answers[name];
  }
  if (Object.keys(dealUpdates).length) {
    await db.update(deals).set(dealUpdates).where(eq(deals.id, deal.id));
  }

  try {
    await recordBorrowerActivity(deal.id, needId, need.itemName, "application");
  } catch (err) {
    console.error("Failed to record borrower activity:", err);
  }

  revalidatePath(`/borrower-upload/${token}`);
  revalidatePath(`/deals/${deal.id}/loan-center`);
  revalidatePath(`/deals/${deal.id}/roles`);
}
