"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { deals, lenderReps, pricingRequestReplyAttachments, pricingRequests } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { sendGmailAs } from "@/server/gmail/send";
import { getLatestThreadReply } from "@/server/gmail/read";
import { getCompanyName, getCompanyLogoHtml } from "@/server/settings";
import { getUserEmailSignatureHtml } from "@/server/users";
import { buildPricingEmail } from "@/server/pricing-templates";
import { plainTextToHtml } from "@/lib/email-html";

export async function updateDealPricingNote(dealId: string, formData: FormData) {
  await requireUser();
  const value = formData.get("pricingNoteToRep");
  const note = typeof value === "string" && value.trim().length ? value.trim() : null;

  await db.update(deals).set({ pricingNoteToRep: note }).where(eq(deals.id, dealId));

  revalidatePath(`/deals/${dealId}`);
}

export async function createPricingRequests(dealId: string, formData: FormData) {
  const user = await requireUser();
  const repIds = formData.getAll("lenderRepIds").filter((v): v is string => typeof v === "string");

  if (!repIds.length) return;

  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) return;

  const companyName = await getCompanyName();

  for (const repId of repIds) {
    const rep = await db.query.lenderReps.findFirst({
      where: eq(lenderReps.id, repId),
      with: { lender: true },
    });
    if (!rep) continue;

    // A lender with a quick pricer has nothing to email — the row just
    // anchors a "go price it yourself" card (and an AI screenshot upload)
    // in the same list instead of a drafted pricing email.
    if (rep.lender.quickPricerUrl) {
      await db.insert(pricingRequests).values({
        dealId,
        lenderId: rep.lenderId,
        lenderRepId: rep.id,
        emailSubject: "",
        emailBody: "",
        isQuickPricer: true,
        status: "sent",
        sentAt: new Date(),
      });
      continue;
    }

    const { subject, body } = await buildPricingEmail(deal, {
      repName: rep.name,
      senderName: user.name ?? "",
      companyName,
      notes: deal.pricingNoteToRep,
    });

    // Rendered to HTML once, here, so the draft can be edited with real
    // formatting (bold, bullet lists) — everything downstream (save, send)
    // treats emailBody as HTML from this point on.
    await db.insert(pricingRequests).values({
      dealId,
      lenderId: rep.lenderId,
      lenderRepId: rep.id,
      emailSubject: subject,
      emailBody: plainTextToHtml(body),
      status: "draft",
    });
  }

  revalidatePath(`/deals/${dealId}`);
}

export async function updatePricingRequest(
  dealId: string,
  requestId: string,
  formData: FormData
) {
  await requireUser();
  const subject = formData.get("emailSubject");
  const body = formData.get("emailBody");
  const cc = formData.get("emailCc");

  await db
    .update(pricingRequests)
    .set({
      emailSubject: typeof subject === "string" ? subject : "",
      emailBody: typeof body === "string" ? body : "",
      emailCc: typeof cc === "string" && cc.trim() ? cc.trim() : null,
    })
    .where(eq(pricingRequests.id, requestId));

  revalidatePath(`/deals/${dealId}`);
}

export async function deletePricingRequest(dealId: string, requestId: string) {
  await requireUser();

  const request = await db.query.pricingRequests.findFirst({
    where: eq(pricingRequests.id, requestId),
  });
  if (!request || request.status !== "draft") {
    throw new Error("Only draft pricing requests can be deleted");
  }

  await db.delete(pricingRequests).where(eq(pricingRequests.id, requestId));

  revalidatePath(`/deals/${dealId}`);
}

async function sendOnePricingRequest(user: { id: string; email: string }, requestId: string) {
  const request = await db.query.pricingRequests.findFirst({
    where: eq(pricingRequests.id, requestId),
    with: { lenderRep: true },
  });
  if (!request) throw new Error("Pricing request not found");
  if (request.status === "sent") return;

  const [logoHtml, signatureHtml] = await Promise.all([
    getCompanyLogoHtml(),
    getUserEmailSignatureHtml(user.id),
  ]);
  const sent = await sendGmailAs(user.id, user.email, {
    to: request.lenderRep.email,
    cc: request.emailCc || null,
    subject: request.emailSubject,
    body: logoHtml + request.emailBody + signatureHtml,
    html: true,
  });

  await db
    .update(pricingRequests)
    .set({
      status: "sent",
      sentAt: new Date(),
      gmailMessageId: sent.id ?? null,
      gmailThreadId: sent.threadId ?? null,
    })
    .where(eq(pricingRequests.id, requestId));
}

export async function sendPricingRequest(dealId: string, requestId: string) {
  const user = await requireUser();
  if (!user.email) throw new Error("Your account has no email on file");

  await sendOnePricingRequest({ id: user.id, email: user.email }, requestId);

  revalidatePath(`/deals/${dealId}`);
}

export async function sendAllPricingRequests(dealId: string) {
  const user = await requireUser();
  if (!user.email) throw new Error("Your account has no email on file");

  const drafts = await db.query.pricingRequests.findMany({
    where: and(eq(pricingRequests.dealId, dealId), eq(pricingRequests.status, "draft")),
  });

  for (const draft of drafts) {
    await sendOnePricingRequest({ id: user.id, email: user.email }, draft.id);
  }

  revalidatePath(`/deals/${dealId}`);
}

export async function checkPricingRequestReply(dealId: string, requestId: string) {
  const user = await requireUser();

  const request = await db.query.pricingRequests.findFirst({
    where: eq(pricingRequests.id, requestId),
  });
  if (!request) throw new Error("Pricing request not found");
  if (!request.gmailThreadId) {
    throw new Error("This request has no Gmail thread on file — it may predate this feature.");
  }

  const reply = await getLatestThreadReply(user.id, request.gmailThreadId);

  if (!reply) {
    await db
      .update(pricingRequests)
      .set({ replyCheckedAt: new Date() })
      .where(eq(pricingRequests.id, requestId));
    revalidatePath(`/deals/${dealId}`);
    return;
  }

  await db
    .update(pricingRequests)
    .set({
      replyCheckedAt: new Date(),
      replyFrom: reply.from,
      replyReceivedAt: reply.receivedAt,
      replyBodyText: reply.bodyText,
    })
    .where(eq(pricingRequests.id, requestId));

  await db.delete(pricingRequestReplyAttachments).where(eq(pricingRequestReplyAttachments.pricingRequestId, requestId));
  if (reply.attachments.length) {
    await db.insert(pricingRequestReplyAttachments).values(
      reply.attachments.map((a) => ({
        pricingRequestId: requestId,
        fileName: a.fileName,
        mimeType: a.mimeType,
        data: a.dataBase64,
      }))
    );
  }

  revalidatePath(`/deals/${dealId}`);
}
