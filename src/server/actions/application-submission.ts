"use server";

import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import { deals, dealClientNeeds, dealClientNeedDocuments } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { sendGmailAs, type GmailAttachment } from "@/server/gmail/send";
import { getCompanyName, getCompanyLogoHtml } from "@/server/settings";
import { getUserEmailSignatureHtml } from "@/server/users";
import { plainTextToHtml } from "@/lib/email-html";
import {
  buildApplicationIntroTemplateTokens,
  buildApplicationSubmissionEmail,
  buildTermsParagraph,
} from "@/server/vendor-templates";
import { renderTemplate } from "@/server/pricing-templates";
import { getEmailRecipientCandidates } from "@/server/email-recipient-candidates";
import { MAX_ATTACHMENT_BYTES, formatMb } from "@/lib/attachment-limits";

export interface AttachableDocument {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  needName: string;
}

/** Documents a processor has approved on this deal's client needs — the only ones offered for attaching to the lender submission email. */
async function getApprovedClientNeedDocuments(dealId: string): Promise<AttachableDocument[]> {
  const needs = await db.query.dealClientNeeds.findMany({
    where: eq(dealClientNeeds.dealId, dealId),
    columns: { id: true, itemName: true },
    with: {
      documents: {
        where: (d, { eq }) => eq(d.reviewStatus, "approved"),
        columns: { id: true, fileName: true, mimeType: true, fileSize: true },
      },
    },
  });

  return needs.flatMap((need) => need.documents.map((doc) => ({ ...doc, needName: need.itemName })));
}

export async function previewApplicationSubmissionEmail(dealId: string) {
  const user = await requireUser();

  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    with: { lender: { with: { reps: true } }, assignedLoanOfficer: true },
  });
  if (!deal) throw new Error("Deal not found");
  if (!deal.lender) throw new Error("No lender on this deal yet");

  const rep = deal.lender.reps[0] ?? null;
  if (!rep) {
    throw new Error(`No rep on file for ${deal.lender.name} yet — add one under Lenders first.`);
  }

  const companyName = await getCompanyName();
  let subject: string;
  let body: string;
  // A lender with its own intro email configured keeps that exact wording
  // (merge fields rendered in), prefixed onto the always-computed terms
  // paragraph — only lenders with no custom intro fall back to the shared,
  // editable default template.
  if (deal.lender.introEmailBody?.trim()) {
    const introTokens = await buildApplicationIntroTemplateTokens(deal, {
      repName: rep.name,
      senderName: user.name ?? "",
      companyName,
    });
    subject = renderTemplate(
      deal.lender.introEmailSubject?.trim() || `${deal.propertyAddress} — Loan Submission`,
      introTokens
    );
    body = `${renderTemplate(deal.lender.introEmailBody.trim(), introTokens)}\n\n${buildTermsParagraph(deal)}`;
  } else {
    const rendered = await buildApplicationSubmissionEmail(deal, {
      repName: rep.name,
      senderName: user.name ?? "",
      companyName,
    });
    subject = rendered.subject;
    body = rendered.body;
  }

  const [signatureHtml, candidates, availableDocuments] = await Promise.all([
    getUserEmailSignatureHtml(user.id),
    getEmailRecipientCandidates(dealId),
    getApprovedClientNeedDocuments(dealId),
  ]);

  // Rendered to HTML once, here, so the compose dialog can offer real
  // formatting (bold, bullet lists) on top of it — sendApplicationSubmissionEmail
  // sends whatever HTML comes back from that editing, unconverted.
  return {
    subject,
    body: plainTextToHtml(body),
    to: rep.email,
    cc: deal.assignedLoanOfficer?.email ?? "",
    signatureHtml,
    candidates,
    availableDocuments,
    // Everything the processor already approved goes out by default —
    // unchecking a document is easier to notice than remembering to check
    // every one that belongs in the submission.
    selectedDocumentIds: availableDocuments.map((d) => d.id),
  };
}

export async function sendApplicationSubmissionEmail(
  dealId: string,
  to: string,
  cc: string,
  subject: string,
  body: string,
  documentIds: string[]
) {
  const user = await requireUser();
  if (!user.email) throw new Error("Your account has no email on file");
  if (!to.trim()) throw new Error("No recipient on file for this email");
  if (!subject.trim() || !body.trim()) throw new Error("Subject and body can't be empty");

  const [logoHtml, signatureHtml] = await Promise.all([
    getCompanyLogoHtml(),
    getUserEmailSignatureHtml(user.id),
  ]);

  let attachments: GmailAttachment[] | undefined;
  if (documentIds.length) {
    // Re-verify against the deal and its approved status server-side rather
    // than trusting the id list from the client — a document only ever
    // leaves as an attachment if it's still approved and still belongs to
    // one of this deal's own client needs.
    const approved = await getApprovedClientNeedDocuments(dealId);
    const approvedById = new Map(approved.map((d) => [d.id, d]));
    const idsToAttach = documentIds.filter((id) => approvedById.has(id));

    // Re-checked here, not just in the dialog — this is the last point
    // before the email actually goes out, so a bypassed or stale client
    // can't slip an oversized attachment set past it and risk a silent
    // bounce the team would mistake for a successful submission.
    const totalBytes = idsToAttach.reduce((sum, id) => sum + (approvedById.get(id)?.fileSize ?? 0), 0);
    if (totalBytes > MAX_ATTACHMENT_BYTES) {
      throw new Error(
        `These attachments total ${formatMb(totalBytes)}, over the ~${formatMb(MAX_ATTACHMENT_BYTES)} limit most email providers will actually deliver — uncheck some documents or send the rest in a follow-up email.`
      );
    }

    if (idsToAttach.length) {
      const rows = await db.query.dealClientNeedDocuments.findMany({
        where: inArray(dealClientNeedDocuments.id, idsToAttach),
        columns: { id: true, fileName: true, mimeType: true, data: true },
      });
      attachments = rows.map((r) => ({ fileName: r.fileName, mimeType: r.mimeType, data: r.data }));
    }
  }

  await sendGmailAs(user.id, user.email, {
    to: to.trim(),
    cc: cc.trim() || null,
    subject,
    body: logoHtml + body + signatureHtml,
    html: true,
    attachments,
  });
}
