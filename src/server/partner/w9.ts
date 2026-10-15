import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { referralAffiliates } from "@/server/db/schema";
import { downloadCompletedDocumentWithRetry } from "@/server/pandadoc";
import { appUrl, button, greeting, notifyAdmins, sendPartnerEmail } from "@/server/partner/email";
import { logPartnerEvent } from "@/server/partner/events";
import { recomputePayoutStatuses } from "@/server/partner/payouts";

/** The partner finished signing their W-9: keep the PDF, mark it received, thank them, tell the admins, release any payouts waiting on it. */
export async function handlePartnerW9Completed(partnerId: string, documentId: string): Promise<void> {
  const partner = await db.query.referralAffiliates.findFirst({ where: eq(referralAffiliates.id, partnerId) });
  if (!partner || partner.w9ReceivedAt) return;

  const pdf = await downloadCompletedDocumentWithRetry(documentId);
  await db
    .update(referralAffiliates)
    .set({
      w9ReceivedAt: new Date(),
      w9FileName: `W-9 — ${partner.name ?? partner.email}.pdf`,
      w9PdfData: pdf ? pdf.toString("base64") : null,
    })
    .where(eq(referralAffiliates.id, partnerId));
  await logPartnerEvent(partnerId, "w9_received", { stored: Boolean(pdf) });
  await recomputePayoutStatuses(partnerId);

  await sendPartnerEmail(partner, {
    subject: "We got your W-9",
    heading: "Your W-9 is on file",
    bodyHtml:
      greeting(partner) +
      `<p style="margin:0 0 16px;">Thanks — your W-9 came through. That's one less thing between you and your payout.</p>` +
      button("Open your portal", `${appUrl()}/partner`),
  });
  await notifyAdmins({
    type: "partner_w9",
    title: `${partner.name ?? partner.email} submitted a W-9`,
    body: pdf ? undefined : "The signed PDF couldn't be downloaded automatically — pull it from PandaDoc.",
    href: "/settings/referrals",
  });
}
