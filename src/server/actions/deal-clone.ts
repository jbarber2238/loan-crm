"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import {
  deals,
  dealNotes,
  dealStageHistory,
  dealClientNeeds,
  dealClientNeedDocuments,
  termSheets,
} from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { formatAddress } from "@/lib/format";

/**
 * Everything the clone dialog needs to render: the original deal's own
 * numbers (to show "identical to $X / $Y?"), its term sheets (to offer
 * copying one over), and its client needs + documents (to offer copying
 * specific ones over) — see cloneNewConstructionDeal below for how each
 * piece actually gets used.
 */
export async function getCloneSourceData(dealId: string) {
  await requireUser();

  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    with: {
      termSheets: { with: { lender: true, product: true } },
      clientNeeds: { with: { documents: true } },
    },
  });
  if (!deal) throw new Error("Deal not found");
  if (deal.loanCategory !== "new_construction") {
    throw new Error("Cloning is only available for New Construction loans.");
  }

  return {
    loanNumber: deal.loanNumber,
    borrowerName: deal.borrowerName,
    purchasePrice: deal.purchasePrice,
    estimatedRehabCost: deal.estimatedRehabCost,
    estimatedArv: deal.estimatedArv,
    loanAmountRequested: deal.loanAmountRequested,
    termSheets: deal.termSheets.map((t) => ({
      id: t.id,
      status: t.status,
      lenderName: t.lender.name,
      productName: t.product.name,
      interestRate: typeof t.fields.interestRate === "number" ? t.fields.interestRate : null,
      loanAmount: typeof t.fields.loanAmount === "number" ? t.fields.loanAmount : null,
    })),
    clientNeeds: deal.clientNeeds.map((n) => ({
      id: n.id,
      itemName: n.itemName,
      status: n.status,
      documents: n.documents.map((d) => ({ id: d.id, fileName: d.fileName })),
    })),
  };
}

export async function cloneNewConstructionDeal(originalDealId: string, formData: FormData) {
  const user = await requireUser();

  const original = await db.query.deals.findFirst({
    where: eq(deals.id, originalDealId),
    with: { clientNeeds: { with: { documents: true } } },
  });
  if (!original) throw new Error("Deal not found");
  if (original.loanCategory !== "new_construction") {
    throw new Error("Cloning is only available for New Construction loans.");
  }

  // --- New property ---
  const addressType = formData.get("addressType");
  const streetAddress = str(formData, "streetAddress");
  const parcelId = str(formData, "parcelId");
  const city = str(formData, "city");
  const state = str(formData, "state");
  const postalCode = str(formData, "postalCode");
  if (addressType === "parcel" ? !parcelId : !streetAddress) {
    throw new Error("A new address or parcel ID is required.");
  }
  const propertyAddress = formatAddress(
    addressType === "parcel" ? `Parcel #${parcelId}` : streetAddress,
    city,
    state,
    postalCode
  );

  // --- Costs: identical, or freshly entered ---
  const costsIdentical = formData.get("costsIdentical") === "yes";
  const purchasePrice = costsIdentical ? original.purchasePrice : numStr(formData, "purchasePrice");
  const estimatedRehabCost = costsIdentical ? original.estimatedRehabCost : numStr(formData, "estimatedRehabCost");
  const estimatedArv = costsIdentical ? original.estimatedArv : numStr(formData, "estimatedArv");
  const loanAmountRequested = costsIdentical
    ? original.loanAmountRequested
    : (numStr(formData, "loanAmountRequested") ?? original.loanAmountRequested);

  const [clone] = await db
    .insert(deals)
    .values({
      // Borrower — same borrower doing another identical build.
      borrowerName: original.borrowerName,
      borrowerEntityName: original.borrowerEntityName,
      borrowerPhone: original.borrowerPhone,
      borrowerEmail: original.borrowerEmail,
      maritalStatus: original.maritalStatus,
      citizenship: original.citizenship,
      estimatedFico: original.estimatedFico,
      borrowerLiquidity: original.borrowerLiquidity,
      numFlips: original.numFlips,
      numRentals: original.numRentals,
      numNewConstruction: original.numNewConstruction,
      mortgageLatesLast12mo: original.mortgageLatesLast12mo,
      taxLiensBkForeclosureLast24mo: original.taxLiensBkForeclosureLast24mo,
      exitStrategy: original.exitStrategy,
      propertyType: original.propertyType,
      unitCount: original.unitCount,
      propertyAlreadyOwned: original.propertyAlreadyOwned,
      rural: original.rural,
      marketingConsent: original.marketingConsent,

      // New property.
      propertyAddress,
      parcelId: addressType === "parcel" ? parcelId : null,
      loanCategory: "new_construction",

      // Costs — identical (default) or freshly entered this round.
      purchasePrice,
      estimatedRehabCost,
      estimatedArv,
      loanAmountRequested: loanAmountRequested ?? "0",
      estimatedAsIsValue: original.estimatedAsIsValue,
      estimatedAsIsLotValue: original.estimatedAsIsLotValue,

      // Same team, fresh pipeline run.
      assignedLoanOfficerId: original.assignedLoanOfficerId,
      assignedProcessorId: original.assignedProcessorId,
      assignedAssistantId: original.assignedAssistantId,
      source: `Cloned from Loan #${original.loanNumber}`,
      stage: "new",
    })
    .returning({ id: deals.id, loanNumber: deals.loanNumber });

  await db.insert(dealStageHistory).values({ dealId: clone.id, stage: "new", changedByUserId: user.id });
  await db.insert(dealNotes).values({
    dealId: clone.id,
    authorUserId: user.id,
    source: "system",
    body: `Cloned from Loan #${original.loanNumber} (${original.propertyAddress}).`,
  });
  await db.insert(dealNotes).values({
    dealId: originalDealId,
    authorUserId: user.id,
    source: "system",
    body: `Cloned to new Loan #${clone.loanNumber} (${propertyAddress}).`,
  });

  // --- Term sheet carryover — only offered/meaningful when costs matched,
  // so the copied dollar figures are still accurate for the new build.
  const copyTermSheetId = costsIdentical ? str(formData, "copyTermSheetId") : null;
  if (copyTermSheetId) {
    const source = await db.query.termSheets.findFirst({ where: eq(termSheets.id, copyTermSheetId) });
    if (source && source.dealId === originalDealId) {
      await db.insert(termSheets).values({
        dealId: clone.id,
        lenderId: source.lenderId,
        productId: source.productId,
        fields: source.fields,
        status: "draft",
        createdBy: user.id,
      });
    }
  }

  // --- Client needs / documents carryover.
  // A need with no documents (a contact-info/questionnaire-style need)
  // copies whole-or-not-at-all via its own checkbox. A need WITH documents
  // is copied per-document instead — e.g. four different budget uploads
  // under one "Construction Budget" need, where only the one that actually
  // belongs to this new property should come over — so the need itself is
  // only created when at least one of its documents was checked, carrying
  // over just those, not every file that was ever attached to it.
  const copyNeedIds = new Set(formData.getAll("copyClientNeedIds").filter((v): v is string => typeof v === "string"));
  const copyDocumentIds = new Set(
    formData.getAll("copyDocumentIds").filter((v): v is string => typeof v === "string")
  );
  for (const need of original.clientNeeds) {
    const docsToCopy = need.documents.filter((d) => copyDocumentIds.has(d.id));
    const shouldCopy = need.documents.length > 0 ? docsToCopy.length > 0 : copyNeedIds.has(need.id);
    if (!shouldCopy) continue;

    const [newNeed] = await db
      .insert(dealClientNeeds)
      .values({
        dealId: clone.id,
        itemName: need.itemName,
        description: need.description,
        needType: need.needType,
        minFiles: need.minFiles,
        linkUrl: need.linkUrl,
        templateFileName: need.templateFileName,
        templateFileMimeType: need.templateFileMimeType,
        templateFileData: need.templateFileData,
        templateFileSize: need.templateFileSize,
        customFormKey: need.customFormKey,
        // Left at defaults deliberately: this is a fresh copy on a new
        // deal, not a continuation — no PandaDoc doc/status, no sentAt, no
        // previously-submitted custom_form answers, and status starts over
        // from not_sent even if the original was already accepted.
      })
      .returning({ id: dealClientNeeds.id });

    for (const doc of docsToCopy) {
      await db.insert(dealClientNeedDocuments).values({
        clientNeedId: newNeed.id,
        fileName: doc.fileName,
        mimeType: doc.mimeType,
        fileSize: doc.fileSize,
        data: doc.data,
        uploadedByUserId: doc.uploadedByUserId,
        reviewStatus: doc.reviewStatus,
        reviewedAt: doc.reviewedAt,
        reviewedByUserId: doc.reviewedByUserId,
        rejectionNote: doc.rejectionNote,
      });
    }
  }

  revalidatePath("/pipeline");
  revalidatePath(`/deals/${originalDealId}`);
  redirect(`/deals/${clone.id}`);
}

function str(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim().length ? value.trim() : null;
}

function numStr(formData: FormData, key: string): string | null {
  return str(formData, key);
}
