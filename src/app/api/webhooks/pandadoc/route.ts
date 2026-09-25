import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { dealClientNeeds, dealClientNeedDocuments, termSheets } from "@/server/db/schema";
import { verifyWebhookSignature, downloadCompletedDocumentWithRetry } from "@/server/pandadoc";
import { recomputeNeedStatus } from "@/server/client-need-status";
import { recordBorrowerActivity } from "@/server/borrower-activity";
import { performTermSheetAcceptance } from "@/server/actions/term-sheets";

interface PandaDocEvent {
  event: string;
  data: { id: string; status: string };
}

// No auth beyond the signature check below — PandaDoc calls this directly,
// there's no user session. Registered as this deal's webhook subscription
// URL when the PandaDoc integration is set up; see src/server/pandadoc.ts.
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = new URL(request.url).searchParams.get("signature");
  if (!(await verifyWebhookSignature(rawBody, signature))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let events: PandaDocEvent[];
  try {
    events = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }

  for (const { data } of events) {
    if (!data?.id) continue;

    const need = await db.query.dealClientNeeds.findFirst({
      where: eq(dealClientNeeds.pandadocDocumentId, data.id),
    });

    if (need) {
      await db.update(dealClientNeeds).set({ pandadocStatus: data.status }).where(eq(dealClientNeeds.id, need.id));

      if (data.status === "document.completed") {
        try {
          await recordBorrowerActivity(need.dealId, need.id, need.itemName, "signed");
        } catch (err) {
          console.error("Failed to record borrower activity:", err);
        }
        try {
          const pdf = await downloadCompletedDocumentWithRetry(data.id);
          if (pdf) {
            await db.insert(dealClientNeedDocuments).values({
              clientNeedId: need.id,
              fileName: `${need.itemName}.pdf`,
              mimeType: "application/pdf",
              fileSize: pdf.length,
              data: pdf.toString("base64"),
              uploadedByUserId: null,
            });
            // Same approve/reject pipeline every other document goes through —
            // a processor reviews this exactly like a borrower-uploaded file.
            await recomputeNeedStatus(need.id);
          }
        } catch (err) {
          // Don't let one failed download (e.g. a Sandbox key, which PandaDoc
          // flatly refuses to let download completed documents) take down the
          // rest of this batch or crash the request — log it and move on. The
          // "PDF ready" event subscription means a fixed key gets another
          // chance to succeed on the next status change for future documents;
          // an already-completed document stuck like this needs a one-off
          // manual re-pull once the key issue is resolved.
          console.error(`Failed to download completed PandaDoc document ${data.id} for need ${need.id}:`, err);
        }
      }
      continue;
    }

    // Not a client-need document — check whether it's a term sheet sent for
    // e-signature instead (see sendTermSheetForSignature in
    // src/server/actions/term-sheets.ts).
    const termSheet = await db.query.termSheets.findFirst({
      where: eq(termSheets.pandadocDocumentId, data.id),
    });
    if (!termSheet) continue; // not one of ours (or already deleted) — ignore

    await db.update(termSheets).set({ pandadocStatus: data.status }).where(eq(termSheets.id, termSheet.id));

    if (data.status === "document.completed") {
      try {
        // Signing IS the acceptance here — no separate manual "Accept"
        // click. Reuses the exact same field-promotion logic that click
        // triggers, so the deal header populates identically either way.
        await performTermSheetAcceptance(termSheet.dealId, termSheet.id);
      } catch (err) {
        console.error(`Failed to auto-accept signed term sheet ${termSheet.id}:`, err);
      }

      try {
        // The acceptance above only promotes the structured numbers onto the
        // deal — this pulls down the actual signed PDF so it's viewable from
        // the term sheet itself, not just its numbers.
        const pdf = await downloadCompletedDocumentWithRetry(data.id);
        if (pdf) {
          await db
            .update(termSheets)
            .set({
              signedDocumentFileName: "Signed Term Sheet.pdf",
              signedDocumentMimeType: "application/pdf",
              signedDocumentData: pdf.toString("base64"),
            })
            .where(eq(termSheets.id, termSheet.id));
        }
      } catch (err) {
        console.error(`Failed to download signed document for term sheet ${termSheet.id}:`, err);
      }
    }
  }

  return new Response("ok", { status: 200 });
}
