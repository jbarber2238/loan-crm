"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { deals, dealClientNeeds, dealClientNeedDocuments, dealClientNeedAnswers } from "@/server/db/schema";
import { recomputeNeedStatus } from "@/server/client-need-status";
import { sendGmailAs } from "@/server/gmail/send";
import { getCompanyName } from "@/server/settings";
import { emailShell, htmlBulletList, escapeHtml } from "@/lib/email-html";
import { createSigningSessionUrl } from "@/server/pandadoc";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName;
}

export interface BorrowerUploadAnswer {
  id: string;
  questionText: string;
  answerText: string | null;
}

export interface BorrowerUploadNeed {
  id: string;
  itemName: string;
  description: string | null;
  needType: "document_upload" | "esign" | "questionnaire" | "link" | "pandadoc_form";
  status: "not_sent" | "awaiting_docs" | "review_needed" | "accepted";
  minFiles: number;
  linkUrl: string | null;
  templateFileName: string | null;
  pandadocDocumentId: string | null;
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
    where: eq(dealClientNeeds.dealId, deal.id),
    with: {
      documents: { columns: { reviewStatus: true, rejectionNote: true } },
      answers: {
        columns: { id: true, questionText: true, answerText: true },
        orderBy: (a, { asc }) => asc(a.sortOrder),
      },
    },
    orderBy: (n, { asc }) => asc(n.createdAt),
  });

  // Every need comes back now, accepted ones included — the page groups them
  // by status (needed, submitted, accepted) so the borrower can see progress
  // toward completion rather than having finished items just disappear.
  const allNeeds: BorrowerUploadNeed[] = needs.map((n) => ({
    id: n.id,
    itemName: n.itemName,
    description: n.description,
    needType: n.needType,
    status: n.status,
    minFiles: n.minFiles,
    linkUrl: n.linkUrl,
    templateFileName: n.templateFileName,
    pandadocDocumentId: n.pandadocDocumentId,
    rejectionNotes: n.documents
      .filter((d) => d.reviewStatus === "rejected" && d.rejectionNote)
      .map((d) => d.rejectionNote!),
    answers: n.answers,
  }));

  return {
    dealId: deal.id,
    borrowerFirstName: firstName(deal.borrowerName),
    propertyAddress: deal.propertyAddress,
    loanNumber: deal.loanNumber,
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

async function notifyBorrowerAndStaff(dealId: string, uploadedNeedNames: string[]) {
  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    with: { assignedLoanOfficer: true, assignedProcessor: true },
  });
  if (!deal) return;

  const companyName = await getCompanyName();
  const sender = deal.assignedLoanOfficer;
  if (!sender?.email) return; // no connected staff mailbox to send as — skip quietly

  const itemsHtml = htmlBulletList(uploadedNeedNames.map((name) => ({ name })));

  // Borrower gets a short thank-you confirming what just came in.
  if (deal.borrowerEmail) {
    try {
      const html = emailShell({
        companyName,
        heading: "Got it — thanks for uploading",
        bodyHtml: `<p style="margin:0 0 16px;">Hi ${escapeHtml(firstName(deal.borrowerName))},</p><p style="margin:0 0 16px;">We received the following and it's now marked complete on our end:</p>${itemsHtml}`,
        signOffName: sender.name ?? companyName,
      });
      await sendGmailAs(sender.id, sender.email, {
        to: deal.borrowerEmail,
        subject: `Received — ${deal.propertyAddress}`,
        body: html,
        html: true,
      });
    } catch (err) {
      console.error("Failed to send borrower upload-confirmation email:", err);
    }
  }

  // Internal notice to whoever's working the file.
  const staffEmails = [deal.assignedProcessor?.email, deal.assignedLoanOfficer?.email].filter(
    (e): e is string => Boolean(e)
  );
  if (staffEmails.length > 0) {
    try {
      const html = emailShell({
        companyName,
        heading: "New documents from your borrower",
        bodyHtml: `<p style="margin:0 0 16px;">${escapeHtml(deal.borrowerName)} just uploaded the following on ${escapeHtml(deal.propertyAddress)}:</p>${itemsHtml}`,
        signOffName: companyName,
      });
      for (const to of staffEmails) {
        await sendGmailAs(sender.id, sender.email, {
          to,
          subject: `New borrower upload — ${deal.propertyAddress}`,
          body: html,
          html: true,
        });
      }
    } catch (err) {
      console.error("Failed to send borrower-upload staff notification:", err);
    }
  }
}

/** Borrower-side upload — token-gated instead of requireUser(). */
export async function uploadBorrowerDocument(token: string, needId: string, formData: FormData) {
  const deal = await db.query.deals.findFirst({ where: eq(deals.borrowerUploadToken, token) });
  if (!deal) throw new Error("This link is no longer valid");

  const need = await db.query.dealClientNeeds.findFirst({
    where: and(eq(dealClientNeeds.id, needId), eq(dealClientNeeds.dealId, deal.id)),
  });
  if (!need || need.needType !== "document_upload" || need.status === "accepted") {
    throw new Error("This item can't accept an upload right now");
  }

  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) throw new Error("Choose at least one file to upload");
  const tooLarge = files.find((f) => f.size > MAX_FILE_SIZE);
  if (tooLarge) throw new Error(`${tooLarge.name} is too large (15MB max)`);

  for (const file of files) {
    const dataBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    await db.insert(dealClientNeedDocuments).values({
      clientNeedId: needId,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      fileSize: file.size,
      data: dataBase64,
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
    await notifyBorrowerAndStaff(deal.id, [need.itemName]);
  } catch (err) {
    console.error("Failed to send borrower-upload notification emails:", err);
  }

  revalidatePath(`/borrower-upload/${token}`);
  revalidatePath(`/deals/${deal.id}/loan-center`);
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
    await notifyBorrowerAndStaff(deal.id, [need.itemName]);
  } catch (err) {
    console.error("Failed to send borrower-submission notification emails:", err);
  }

  revalidatePath(`/borrower-upload/${token}`);
  revalidatePath(`/deals/${deal.id}/loan-center`);
}
