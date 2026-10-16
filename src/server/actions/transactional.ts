"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { transactionalLenders, transactionalLoans } from "@/server/db/schema";
import { requireAdmin, requireAdminOrLoanOfficer } from "@/server/auth/guards";
import { sendGmailAs } from "@/server/gmail/send";
import { getCompanyLogoHtml } from "@/server/settings";
import { getUserEmailSignatureHtml } from "@/server/users";
import { notifyAdminsOfNewTransactionalLoan, sendTransactionalReceipt } from "@/server/transactional-notifications";
import { TRANSACTIONAL_STAGES, buildLenderEmailHtml } from "@/lib/transactional-shared";
import { MINIMUM_FUNDING_AMOUNT } from "@/lib/transactional-fees";
import { ARCHIVABLE_STAGES } from "@/lib/deal-pipeline";
import { lenderEmailRecipients, parseAdditionalContacts } from "@/lib/transactional-lender-contacts";
import { easternToday, isSameDayFundingByTiming } from "@/lib/same-day-funding";
import { fail } from "@/lib/action-result";

function str(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}
function nullableStr(formData: FormData, key: string): string | null {
  const value = str(formData, key);
  return value.length ? value : null;
}
function parseAmount(raw: string): string {
  const n = Number(raw.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) throw new Error("Enter the funding amount as a number");
  return n.toFixed(2);
}
function parseDay(raw: string | null): Date | null {
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error("Pick a valid closing date");
  return new Date(raw);
}

// ---- Public intake (no sign-in) -------------------------------------------

export async function submitTransactionalIntake(formData: FormData) {
  // We act the moment a request lands, so there's nothing to do for a property
  // that isn't under contract yet.
  if (formData.get("underContract") !== "yes") {
    return fail("The property must be under contract to request transactional funds.");
  }
  // We fund one structure only. Anyone who won't confirm it is turned away
  // here, before anything is saved or anyone is notified.
  if (formData.get("confirmDoubleClose") !== "on") {
    return fail("We only fund traditional A-to-B, B-to-C double closes. Please confirm that's your transaction to submit a request.");
  }
  const propertyAddress = str(formData, "propertyAddress");
  const borrowerName = str(formData, "borrowerName");
  const borrowerPhone = str(formData, "borrowerPhone");
  const borrowerEmail = str(formData, "borrowerEmail");
  const titleCompanyName = str(formData, "titleCompanyName");
  if (!propertyAddress) return fail("The property address is required");
  if (!borrowerName || !borrowerPhone || !borrowerEmail) return fail("Your name, phone and email are required");
  if (!titleCompanyName) return fail("The title company is required");
  if (!str(formData, "titleAgentName") || !str(formData, "titlePhone") || !str(formData, "titleEmail")) {
    return fail("The title agent's name, phone and email are required.");
  }
  const closingDate = parseDay(str(formData, "closingDate") || null);
  if (!closingDate) return fail("The closing date is required");
  const closingDay = str(formData, "closingDate");
  if (closingDay < easternToday()) return fail("The closing date can't be in the past.");
  const fundingAmount = parseAmount(str(formData, "fundingAmount"));
  if (Number(fundingAmount) < MINIMUM_FUNDING_AMOUNT) {
    return fail(`We fund double closes starting at $${MINIMUM_FUNDING_AMOUNT.toLocaleString("en-US")}.`);
  }

  const [loan] = await db
    .insert(transactionalLoans)
    .values({
      propertyAddress,
      fundingAmount,
      closingDate,
      borrowerName,
      borrowerPhone,
      borrowerEmail,
      titleCompanyName,
      titleAgentName: nullableStr(formData, "titleAgentName"),
      titlePhone: nullableStr(formData, "titlePhone"),
      titleEmail: nullableStr(formData, "titleEmail"),
      // Ticked by the borrower, or implied by the timing: closing today, or
      // after the 4 PM Eastern cutoff the day before.
      sameDayFunding: formData.get("sameDayFunding") === "on" || isSameDayFundingByTiming(closingDay),
      marketingConsent: formData.get("marketingConsent") === "on",
      marketingConsentAt: formData.get("marketingConsent") === "on" ? new Date() : null,
    })
    .returning();

  await notifyAdminsOfNewTransactionalLoan(loan).catch((err) => {
    console.error("Failed to send transactional request alert:", err);
  });
  await sendTransactionalReceipt(loan).catch((err) => {
    console.error("Failed to send transactional receipt:", err);
  });

  redirect("/transactional/request?submitted=1");
}

// ---- Staff actions ---------------------------------------------------------

function revalidate(id?: string) {
  revalidatePath("/pipeline/transactional");
  if (id) revalidatePath(`/pipeline/transactional/${id}`);
}

export async function updateTransactionalLoan(id: string, formData: FormData) {
  await requireAdminOrLoanOfficer();
  const pointsRaw = str(formData, "brokerPoints");
  let brokerPoints: string | null = null;
  if (pointsRaw) {
    const n = Number(pointsRaw);
    if (!Number.isFinite(n) || n < 0 || n > 10) throw new Error("Broker points must be a number between 0 and 10");
    brokerPoints = n.toFixed(3);
  }
  const address = str(formData, "propertyAddress");
  if (!address) throw new Error("The property address is required");

  await db
    .update(transactionalLoans)
    .set({
      propertyAddress: address,
      fundingAmount: parseAmount(str(formData, "fundingAmount")),
      closingDate: parseDay(nullableStr(formData, "closingDate")),
      borrowerName: nullableStr(formData, "borrowerName"),
      borrowerPhone: nullableStr(formData, "borrowerPhone"),
      borrowerEmail: nullableStr(formData, "borrowerEmail"),
      titleCompanyName: nullableStr(formData, "titleCompanyName"),
      titleAgentName: nullableStr(formData, "titleAgentName"),
      titlePhone: nullableStr(formData, "titlePhone"),
      titleEmail: nullableStr(formData, "titleEmail"),
      sameDayFunding: formData.get("sameDayFunding") === "on",
      brokerPoints,
      updatedAt: new Date(),
    })
    .where(eq(transactionalLoans.id, id));
  revalidate(id);
}

/** Quick adjust from the header: the broker's own points (blank = the standard amount for the size) and same-day funding. */
export async function updateTransactionalFee(id: string, brokerPointsRaw: string, sameDayFunding: boolean) {
  await requireAdminOrLoanOfficer();
  let brokerPoints: string | null = null;
  if (brokerPointsRaw.trim()) {
    const n = Number(brokerPointsRaw);
    if (!Number.isFinite(n) || n < 0 || n > 10) throw new Error("Points must be a number between 0 and 10");
    brokerPoints = n.toFixed(3);
  }
  await db
    .update(transactionalLoans)
    .set({ brokerPoints, sameDayFunding, updatedAt: new Date() })
    .where(eq(transactionalLoans.id, id));
  revalidate(id);
}

export async function setTransactionalStage(id: string, stage: string, reason?: string) {
  await requireAdminOrLoanOfficer();
  if (!TRANSACTIONAL_STAGES.some((s) => s.value === stage)) throw new Error("Invalid stage");
  const trimmed = reason?.trim() ?? "";
  if (stage === "lost" && !trimmed) throw new Error("A reason is required to mark this lost");

  await db
    .update(transactionalLoans)
    .set({
      stage: stage as (typeof TRANSACTIONAL_STAGES)[number]["value"],
      stageChangedAt: new Date(),
      lostReason: stage === "lost" ? trimmed : null,
      updatedAt: new Date(),
    })
    .where(eq(transactionalLoans.id, id));
  revalidate(id);
}

// Soft delete, like deals: typed DELETE confirms (re-checked here), anyone who
// works this pipeline can do it, only an admin can undo it, and it is purged
// for good after 30 days.
export async function deleteTransactionalLoan(id: string, confirmText: string) {
  const user = await requireAdminOrLoanOfficer();
  if (confirmText.trim() !== "DELETE") throw new Error('Type "DELETE" exactly to confirm.');
  await db
    .update(transactionalLoans)
    .set({ deletedAt: new Date(), deletedByUserId: user.id })
    .where(eq(transactionalLoans.id, id));
  revalidate(id);
  revalidatePath("/settings/deleted-deals");
}

export async function restoreDeletedTransactionalLoan(id: string) {
  await requireAdmin();
  await db
    .update(transactionalLoans)
    .set({ deletedAt: null, deletedByUserId: null })
    .where(eq(transactionalLoans.id, id));
  revalidate(id);
  revalidatePath("/settings/deleted-deals");
}

// Only a Closed or Lost request can be archived — it has to actually be done,
// one way or the other. Fully reversible.
export async function archiveTransactionalLoan(id: string) {
  const user = await requireAdminOrLoanOfficer();
  const loan = await db.query.transactionalLoans.findFirst({ where: eq(transactionalLoans.id, id), columns: { stage: true } });
  if (!loan) throw new Error("Request not found");
  if (!ARCHIVABLE_STAGES.has(loan.stage)) throw new Error("Only a Closed or Lost request can be archived.");
  await db
    .update(transactionalLoans)
    .set({ archivedAt: new Date(), archivedByUserId: user.id })
    .where(eq(transactionalLoans.id, id));
  revalidate(id);
  revalidatePath("/pipeline/transactional/archived");
}

export async function restoreArchivedTransactionalLoan(id: string) {
  await requireAdminOrLoanOfficer();
  await db
    .update(transactionalLoans)
    .set({ archivedAt: null, archivedByUserId: null })
    .where(eq(transactionalLoans.id, id));
  revalidate(id);
  revalidatePath("/pipeline/transactional/archived");
}

// ---- Email to the transactional lender ------------------------------------

export async function previewTransactionalLenderEmail(id: string, lenderId: string) {
  await requireAdminOrLoanOfficer();
  const [loan, lender] = await Promise.all([
    db.query.transactionalLoans.findFirst({ where: eq(transactionalLoans.id, id) }),
    db.query.transactionalLenders.findFirst({ where: eq(transactionalLenders.id, lenderId) }),
  ]);
  if (!loan) throw new Error("Request not found");
  if (!lender) throw new Error("Pick a transactional lender");

  return {
    // Everyone at the lender who needs to hear about a deal: the main contact
    // plus every additional contact, always.
    to: lenderEmailRecipients(lender.email, lender.additionalContacts).join(", "),
    subject: `Double close funding request — ${loan.propertyAddress}`,
    body: buildLenderEmailHtml({
      lenderName: lender.name,
      closingDate: loan.closingDate,
      borrowerName: loan.borrowerName,
      borrowerPhone: loan.borrowerPhone,
      borrowerEmail: loan.borrowerEmail,
      fundingAmount: Number(loan.fundingAmount),
      titleCompanyName: loan.titleCompanyName,
      titleAgentName: loan.titleAgentName,
      titlePhone: loan.titlePhone,
      titleEmail: loan.titleEmail,
    }),
  };
}

export async function sendTransactionalLenderEmail(
  id: string,
  lenderId: string,
  to: string,
  cc: string,
  subject: string,
  body: string
) {
  const user = await requireAdminOrLoanOfficer();
  const lender = await db.query.transactionalLenders.findFirst({ where: eq(transactionalLenders.id, lenderId) });
  if (!lender) return fail("Pick a transactional lender");
  if (!user.email) return fail("Your account has no email on file");
  if (!to.trim()) return fail("This lender has no email on file — add it under Lenders first, or type one here");
  if (!subject.trim() || !body.trim()) return fail("Subject and body can't be empty");

  const [logoHtml, signatureHtml] = await Promise.all([getCompanyLogoHtml(), getUserEmailSignatureHtml(user.id)]);
  await sendGmailAs(user.id, user.email, {
    to: to.trim(),
    cc: cc.trim() || null,
    subject: subject.trim(),
    body: logoHtml + body + signatureHtml,
    html: true,
    category: "transactional_lender",
  });

  await db
    .update(transactionalLoans)
    // The lender it was emailed to becomes the request's lender.
    .set({ transactionalLenderId: lender.id, sentToLenderAt: new Date(), updatedAt: new Date() })
    .where(eq(transactionalLoans.id, id));
  // New -> Sent to Lender; a re-send at any later stage doesn't move it.
  const loan = await db.query.transactionalLoans.findFirst({ where: eq(transactionalLoans.id, id), columns: { stage: true } });
  if (loan?.stage === "new") {
    await db
      .update(transactionalLoans)
      .set({ stage: "sent_to_lender", stageChangedAt: new Date() })
      .where(eq(transactionalLoans.id, id));
  }
  revalidate(id);
}

// ---- Transactional lenders (Lenders page) ---------------------------------

export async function createTransactionalLender(formData: FormData) {
  await requireAdmin();
  const name = str(formData, "name");
  if (!name) throw new Error("Name is required");
  await db.insert(transactionalLenders).values({
    name,
    phone: nullableStr(formData, "phone"),
    email: nullableStr(formData, "email"),
    additionalContacts: parseAdditionalContacts(str(formData, "additionalContacts")),
    notes: nullableStr(formData, "notes"),
  });
  revalidatePath("/lenders");
}

export async function updateTransactionalLender(id: string, formData: FormData) {
  await requireAdmin();
  const name = str(formData, "name");
  if (!name) throw new Error("Name is required");
  await db
    .update(transactionalLenders)
    .set({
      name,
      phone: nullableStr(formData, "phone"),
      email: nullableStr(formData, "email"),
      additionalContacts: parseAdditionalContacts(str(formData, "additionalContacts")),
      notes: nullableStr(formData, "notes"),
    })
    .where(eq(transactionalLenders.id, id));
  revalidatePath("/lenders");
}

export async function deleteTransactionalLender(id: string) {
  await requireAdmin();
  await db.delete(transactionalLenders).where(eq(transactionalLenders.id, id));
  revalidatePath("/lenders");
}
