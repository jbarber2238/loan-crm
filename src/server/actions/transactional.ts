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
import { plainTextToHtml } from "@/lib/email-html";
import { notifyAdminsOfNewTransactionalLoan } from "@/server/transactional-notifications";
import { TRANSACTIONAL_STAGES, buildLenderEmailBody } from "@/lib/transactional-shared";
import { MINIMUM_FUNDING_AMOUNT } from "@/lib/transactional-fees";
import { easternToday, isSameDayFundingByTiming } from "@/lib/same-day-funding";

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
  const propertyAddress = str(formData, "propertyAddress");
  const borrowerName = str(formData, "borrowerName");
  const borrowerPhone = str(formData, "borrowerPhone");
  const borrowerEmail = str(formData, "borrowerEmail");
  const titleCompanyName = str(formData, "titleCompanyName");
  if (!propertyAddress) throw new Error("The property address is required");
  if (!borrowerName || !borrowerPhone || !borrowerEmail) throw new Error("Your name, phone and email are required");
  if (!titleCompanyName) throw new Error("The title company is required");
  const closingDate = parseDay(str(formData, "closingDate") || null);
  if (!closingDate) throw new Error("The closing date is required");
  const closingDay = str(formData, "closingDate");
  if (closingDay < easternToday()) throw new Error("The closing date can't be in the past.");
  const fundingAmount = parseAmount(str(formData, "fundingAmount"));
  if (Number(fundingAmount) < MINIMUM_FUNDING_AMOUNT) {
    throw new Error(`We fund double closes starting at $${MINIMUM_FUNDING_AMOUNT.toLocaleString("en-US")}.`);
  }

  const firstLender = await db.query.transactionalLenders.findFirst({
    orderBy: (l, { asc }) => asc(l.createdAt),
  });

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
      transactionalLenderId: firstLender?.id ?? null,
    })
    .returning();

  await notifyAdminsOfNewTransactionalLoan(loan).catch((err) => {
    console.error("Failed to send transactional request alert:", err);
  });

  redirect("/intake/transactional?submitted=1");
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
      transactionalLenderId: nullableStr(formData, "transactionalLenderId"),
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

export async function deleteTransactionalLoan(id: string) {
  await requireAdmin();
  await db.delete(transactionalLoans).where(eq(transactionalLoans.id, id));
  revalidate();
}

// ---- Email to the transactional lender ------------------------------------

export async function previewTransactionalLenderEmail(id: string) {
  await requireAdminOrLoanOfficer();
  const loan = await db.query.transactionalLoans.findFirst({
    where: eq(transactionalLoans.id, id),
    with: { lender: true },
  });
  if (!loan) throw new Error("Request not found");
  if (!loan.lender) throw new Error("Pick a transactional lender for this request first");

  return {
    to: loan.lender.email ?? "",
    subject: `Double close funding request — ${loan.propertyAddress}`,
    body: buildLenderEmailBody({
      lenderName: loan.lender.name,
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

export async function sendTransactionalLenderEmail(id: string, to: string, subject: string, body: string) {
  const user = await requireAdminOrLoanOfficer();
  if (!user.email) throw new Error("Your account has no email on file");
  if (!to.trim()) throw new Error("This lender has no email on file — add it under Lenders first, or type one here");
  if (!subject.trim() || !body.trim()) throw new Error("Subject and body can't be empty");

  const [logoHtml, signatureHtml] = await Promise.all([getCompanyLogoHtml(), getUserEmailSignatureHtml(user.id)]);
  await sendGmailAs(user.id, user.email, {
    to: to.trim(),
    subject: subject.trim(),
    body: logoHtml + plainTextToHtml(body) + signatureHtml,
    html: true,
    category: "transactional_lender",
  });

  await db
    .update(transactionalLoans)
    .set({ sentToLenderAt: new Date(), updatedAt: new Date() })
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
