"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { deals, dealClientNeeds } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { sendGmailAs } from "@/server/gmail/send";
import { getCompanyName, getCompanyLogoHtml } from "@/server/settings";
import { getUserEmailSignatureHtml } from "@/server/users";
import { getOrCreateBorrowerUploadLink } from "@/server/actions/deals";
import { buildBorrowerEmail } from "@/server/borrower-templates";
import { recomputeNeedStatus } from "@/server/client-need-status";
import { createAndSendPandaDocForm } from "@/server/actions/client-needs";
import { getEmailRecipientCandidates } from "@/server/email-recipient-candidates";
import {
  escapeHtml,
  htmlBulletList,
  htmlButton,
  EMAIL_LIST_STYLE,
  EMAIL_ITEM_STYLE,
  EMAIL_SUBNOTE_STYLE,
  EMAIL_SECTION_HEADING_STYLE,
} from "@/lib/email-html";

// One combined status block: rejected items (with the processor's note) come
// first since they need action soonest, then everything else still owed —
// this is the one email format used for both a brand-new send (nothing
// rejected yet, just the outstanding section) and a follow-up after a
// rejection, rather than two separate email types. Rendered as HTML so it
// reads like a real formatted email, not a plain-text dump.
function formatStatusList(
  rejectedNeeds: { itemName: string; documents: { fileName: string; rejectionNote: string | null }[] }[],
  outstandingNeeds: { itemName: string; description: string | null }[]
): string {
  const sections: string[] = [];
  if (rejectedNeeds.length > 0) {
    const list = rejectedNeeds
      .map((n) => {
        const notes = n.documents
          .map(
            (d) =>
              `<br/><span style="${EMAIL_SUBNOTE_STYLE}">${escapeHtml(d.fileName)}: ${escapeHtml(
                d.rejectionNote ?? "No reason given"
              )}</span>`
          )
          .join("");
        return `<li style="${EMAIL_ITEM_STYLE}"><strong>${escapeHtml(n.itemName)}</strong> — needs to be resubmitted${notes}</li>`;
      })
      .join("");
    sections.push(
      `<div style="margin:0 0 20px;"><p style="${EMAIL_SECTION_HEADING_STYLE} color:#b91c1c;">These were not accepted and need to be resubmitted:</p><ul style="${EMAIL_LIST_STYLE}">${list}</ul></div>`
    );
  }
  if (outstandingNeeds.length > 0) {
    sections.push(
      `<div><p style="${EMAIL_SECTION_HEADING_STYLE}">Still needed:</p>${htmlBulletList(
        outstandingNeeds.map((n) => ({ name: n.itemName, note: n.description }))
      )}</div>`
    );
  }
  return sections.join("");
}

async function loadDealForEmail(dealId: string) {
  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    with: { assignedLoanOfficer: true, followers: true },
  });
  if (!deal?.borrowerEmail) throw new Error("This deal has no borrower email on file");
  return deal;
}

function getNeedIds(needIds: string[]): string[] {
  if (!needIds.length) throw new Error("Select at least one client need first");
  return needIds;
}

/**
 * Renders (but does not send) the combined client-needs update email for the
 * given selection, so the UI can show an editable preview before sending.
 */
export async function previewClientNeedsUpdateEmail(dealId: string, needIds: string[]) {
  const user = await requireUser();
  const ids = getNeedIds(needIds);
  const deal = await loadDealForEmail(dealId);

  // Needs on hold are never mentioned to the borrower, even if selected.
  const needs = await db.query.dealClientNeeds.findMany({
    where: and(eq(dealClientNeeds.dealId, dealId), inArray(dealClientNeeds.id, ids), isNull(dealClientNeeds.onHoldAt)),
    with: { documents: true },
  });
  if (!needs.length) throw new Error("The selected client needs are on hold (or couldn't be found) — nothing to send.");

  const rejectedNeedRows = needs.filter((n) => n.documents.some((d) => d.reviewStatus === "rejected"));
  const rejectedIds = new Set(rejectedNeedRows.map((n) => n.id));
  const rejectedNeeds = rejectedNeedRows.map((n) => ({
    itemName: n.itemName,
    documents: n.documents.filter((d) => d.reviewStatus === "rejected"),
  }));
  const outstandingNeeds = needs.filter((n) => n.status !== "accepted" && !rejectedIds.has(n.id));

  if (rejectedNeeds.length === 0 && outstandingNeeds.length === 0) {
    throw new Error("All selected items are already accepted — nothing to send.");
  }

  const companyName = await getCompanyName();
  const uploadUrl = await getOrCreateBorrowerUploadLink(dealId);
  const [{ subject, body }, signatureHtml, candidates] = await Promise.all([
    buildBorrowerEmail("borrower_client_needs_update", deal, {
      assignedLoanOfficerName: deal.assignedLoanOfficer?.name ?? "",
      companyName,
      senderName: user.name ?? "",
      extra: {
        clientNeedsStatusList: formatStatusList(rejectedNeeds, outstandingNeeds),
        clientNeedsUploadUrl: uploadUrl,
        clientNeedsUploadButton: htmlButton("Upload your documents", uploadUrl),
      },
    }),
    getUserEmailSignatureHtml(user.id),
    getEmailRecipientCandidates(dealId, { includeAllStaff: true }),
  ]);

  // Followers are CC'd by default here, and only here — client-needs
  // updates are the one email type they're always on unless removed.
  // The deal's loan officer (Roles and Key Contacts) is copied too, unless
  // they're the one sending — they already get that in their Sent folder.
  const seen = new Set<string>([deal.borrowerEmail!.toLowerCase(), (user.email ?? "").toLowerCase()]);
  const ccList: string[] = [];
  for (const email of [deal.assignedLoanOfficer?.email, ...deal.followers.map((f) => f.email)]) {
    if (!email || seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    ccList.push(email);
  }
  const cc = ccList.join(", ");

  return { subject, body, to: deal.borrowerEmail!, cc, signatureHtml, candidates };
}

/**
 * Sends exactly the given (possibly hand-edited) to/cc/subject/body — no
 * re-rendering from the template — then marks the non-rejected, unsent needs
 * in the selection as sent.
 */
export async function sendClientNeedsUpdateEmail(
  dealId: string,
  needIds: string[],
  to: string,
  cc: string,
  subject: string,
  body: string
) {
  const user = await requireUser();
  if (!user.email) throw new Error("Your account has no email on file");
  if (!to.trim()) throw new Error("No recipient on file for this email");
  const ids = getNeedIds(needIds);
  await loadDealForEmail(dealId);

  if (!subject.trim() || !body.trim()) throw new Error("Subject and body can't be empty");

  // Any PandaDoc Form needs in this selection that haven't been created yet
  // get created and sent to PandaDoc right now — the same moment the
  // borrower is actually told about them, matching every other need type's
  // timing instead of firing the moment the need was added to the deal.
  const pandadocNeeds = await db.query.dealClientNeeds.findMany({
    where: and(
      inArray(dealClientNeeds.id, ids),
      eq(dealClientNeeds.needType, "pandadoc_form"),
      isNull(dealClientNeeds.pandadocDocumentId)
    ),
  });
  for (const need of pandadocNeeds) {
    if (!need.pandadocTemplateUuid) continue;
    await createAndSendPandaDocForm(dealId, need.id, need.pandadocTemplateUuid, need.itemName);
  }

  const [logoHtml, signatureHtml] = await Promise.all([
    getCompanyLogoHtml(),
    getUserEmailSignatureHtml(user.id),
  ]);
  await sendGmailAs(user.id, user.email, {
    to: to.trim(),
    cc: cc.trim() || null,
    subject,
    body: logoHtml + body + signatureHtml,
    html: true,
  });

  await db
    .update(dealClientNeeds)
    .set({ sentAt: new Date() })
    .where(and(inArray(dealClientNeeds.id, ids), isNull(dealClientNeeds.sentAt), isNull(dealClientNeeds.onHoldAt)));
  for (const id of ids) await recomputeNeedStatus(id);

  revalidatePath(`/deals/${dealId}/loan-center`);
}
