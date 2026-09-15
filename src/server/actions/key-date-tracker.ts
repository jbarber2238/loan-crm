"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { deals, dealKeyDateEvents } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { sendGmailAs } from "@/server/gmail/send";
import { getCompanyName, getCompanyLogoHtml } from "@/server/settings";
import { getUserEmailSignatureHtml } from "@/server/users";
import { buildKeyDateOrderEmail } from "@/server/vendor-templates";
import { getEmailRecipientCandidates } from "@/server/email-recipient-candidates";
import type { KeyDateItem } from "@/lib/key-date-tracker";

const NOTES_COLUMN: Record<KeyDateItem, "appraisalNotes" | "insuranceNotes" | "titleNotes"> = {
  appraisal: "appraisalNotes",
  insurance: "insuranceNotes",
  title: "titleNotes",
};

export async function addKeyDateEvent(dealId: string, item: KeyDateItem, formData: FormData) {
  const user = await requireUser();
  const status = formData.get("status");
  const eventDateStr = formData.get("eventDate");
  if (typeof status !== "string" || !status.trim()) throw new Error("Choose a status");
  if (typeof eventDateStr !== "string" || !eventDateStr) throw new Error("Choose a date");

  await db.insert(dealKeyDateEvents).values({
    dealId,
    item,
    status: status.trim(),
    eventDate: new Date(eventDateStr),
    createdByUserId: user.id,
  });

  revalidatePath(`/deals/${dealId}/loan-center`);
}

export async function deleteKeyDateEvent(dealId: string, eventId: string) {
  await requireUser();
  await db.delete(dealKeyDateEvents).where(and(eq(dealKeyDateEvents.id, eventId), eq(dealKeyDateEvents.dealId, dealId)));
  revalidatePath(`/deals/${dealId}/loan-center`);
}

// "Ordered" is the root every later status depends on — deleting it wipes
// the item's whole history back to Not Ordered rather than leaving orphaned
// Paid/Scheduled/etc. entries with no Ordered underneath them.
export async function resetKeyDateItem(dealId: string, item: KeyDateItem) {
  await requireUser();
  await db.delete(dealKeyDateEvents).where(and(eq(dealKeyDateEvents.dealId, dealId), eq(dealKeyDateEvents.item, item)));
  revalidatePath(`/deals/${dealId}/loan-center`);
}

export async function updateKeyDateNotes(dealId: string, item: KeyDateItem, formData: FormData) {
  await requireUser();
  const notes = formData.get("notes");
  const column = NOTES_COLUMN[item];

  await db
    .update(deals)
    .set({ [column]: typeof notes === "string" && notes.trim() ? notes.trim() : null, updatedAt: new Date() })
    .where(eq(deals.id, dealId));

  revalidatePath(`/deals/${dealId}/loan-center`);
}

interface OrderEmailContact {
  name: string | null;
  email: string | null;
}

function contactFor(
  item: "insurance" | "title",
  deal: {
    insuranceAgentName: string | null;
    insuranceAgentEmail: string | null;
    titleCompanyAgentName: string | null;
    titleAgentEmail: string | null;
  }
): OrderEmailContact {
  if (item === "insurance") {
    return { name: deal.insuranceAgentName, email: deal.insuranceAgentEmail };
  }
  return { name: deal.titleCompanyAgentName, email: deal.titleAgentEmail };
}

/** Renders (but does not send) the order-request email so the UI can show an editable preview. */
export async function previewKeyDateOrderEmail(dealId: string, item: "insurance" | "title") {
  const user = await requireUser();
  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    with: { lender: { with: { reps: true } } },
  });
  if (!deal) throw new Error("Deal not found");

  const contact = contactFor(item, deal);
  if (!contact.email) {
    throw new Error(
      `No ${item === "insurance" ? "insurance agent" : "title agent"} email on file yet — add one under Roles and Key Contacts first.`
    );
  }

  const companyName = await getCompanyName();
  const [{ subject, body }, signatureHtml, candidates] = await Promise.all([
    buildKeyDateOrderEmail(item, deal, {
      contactName: contact.name,
      senderName: user.name ?? "",
      senderEmail: user.email ?? "",
      companyName,
    }),
    getUserEmailSignatureHtml(user.id),
    getEmailRecipientCandidates(dealId),
  ]);

  // The lender rep is CC'd by default on both insurance and title orders —
  // they need visibility into vendor coordination without being the primary
  // recipient.
  const repEmail = deal.lender?.reps[0]?.email ?? "";

  return { subject, body, to: contact.email, cc: repEmail, signatureHtml, candidates };
}

/**
 * Sends exactly the given (possibly hand-edited) subject/body/to/cc, then —
 * only if this item has never had a status logged before — records
 * "Ordered" today, matching the idea that clicking Email here is literally
 * how you place the order. Re-sending a follow-up later won't re-log it.
 */
export async function sendKeyDateOrderEmail(
  dealId: string,
  item: "insurance" | "title",
  to: string,
  cc: string,
  subject: string,
  body: string
) {
  const user = await requireUser();
  if (!user.email) throw new Error("Your account has no email on file");
  if (!to.trim()) throw new Error("No recipient on file for this email");

  if (!subject.trim() || !body.trim()) throw new Error("Subject and body can't be empty");

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

  const existing = await db.query.dealKeyDateEvents.findFirst({
    where: and(eq(dealKeyDateEvents.dealId, dealId), eq(dealKeyDateEvents.item, item)),
  });
  if (!existing) {
    await db.insert(dealKeyDateEvents).values({
      dealId,
      item,
      status: "Ordered",
      eventDate: new Date(),
      createdByUserId: user.id,
    });
  }

  revalidatePath(`/deals/${dealId}/loan-center`);
}
