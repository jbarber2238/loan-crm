"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { clientNeeds, deals, dealClientNeeds, productClientNeeds, categoryClientNeeds, products } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { copyQuestionsToNewNeeds } from "@/server/client-need-questions";
import { createClientNeed } from "@/server/actions/client-need-catalog";
import { createDocumentFromTemplate, waitUntilDraft, sendDocumentSilently } from "@/server/pandadoc";

type CatalogNeedRow = {
  id: string;
  itemName: string;
  description: string | null;
  needType: "document_upload" | "esign" | "questionnaire" | "link" | "pandadoc_form";
  minFiles: number;
  linkUrl: string | null;
  templateFileName: string | null;
  templateFileMimeType: string | null;
  templateFileData: string | null;
  templateFileSize: number | null;
  pandadocTemplateUuid: string | null;
};

// Creates and sends the PandaDoc document for one need — called from
// sendClientNeedsUpdateEmail (client-needs-email.ts) at the same moment the
// borrower is actually told about it via the "Send to Borrower" email, not
// when the need is first added to the deal. That keeps PandaDoc Form
// behaving exactly like every other need type: nothing happens until you
// explicitly send it. Doesn't pre-fill tokens yet — we don't know Justin's
// template's token names until we see a real one, so for now the borrower
// fills in everything themselves. Lets errors propagate — this now runs as
// part of an explicit, user-visible action, so a failure should surface
// immediately rather than be silently swallowed.
export async function createAndSendPandaDocForm(dealId: string, dealNeedId: string, templateUuid: string, itemName: string) {
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal?.borrowerEmail) {
    throw new Error(`Can't send "${itemName}" — this deal has no borrower email on file yet`);
  }
  const [firstName, ...rest] = deal.borrowerName.trim().split(/\s+/);
  const { id } = await createDocumentFromTemplate({
    templateUuid,
    name: `${itemName} — ${deal.propertyAddress}`,
    recipientEmail: deal.borrowerEmail,
    recipientFirstName: firstName || deal.borrowerName,
    recipientLastName: rest.join(" "),
  });
  await waitUntilDraft(id);
  await sendDocumentSilently(id);
  await db
    .update(dealClientNeeds)
    .set({ pandadocDocumentId: id, pandadocStatus: "document.sent" })
    .where(eq(dealClientNeeds.id, dealNeedId));
}

// Shared by every "copy these catalog items onto a deal" entry point —
// inserts the deal-level snapshot rows (including a link URL or a
// downloadable template file, if the catalog item has one) and copies any
// questionnaire questions onto them. Skips items that already exist on the
// deal by name.
async function addCatalogNeedsToDeal(dealId: string, catalogNeeds: CatalogNeedRow[]) {
  const existing = await db.query.dealClientNeeds.findMany({
    where: eq(dealClientNeeds.dealId, dealId),
    columns: { itemName: true },
  });
  const existingNames = new Set(existing.map((e) => e.itemName.toLowerCase()));
  const toAdd = catalogNeeds.filter((n) => !existingNames.has(n.itemName.toLowerCase()));
  if (!toAdd.length) return 0;

  const inserted = await db
    .insert(dealClientNeeds)
    .values(
      toAdd.map((n) => ({
        dealId,
        itemName: n.itemName,
        description: n.description,
        needType: n.needType,
        minFiles: n.minFiles,
        linkUrl: n.linkUrl,
        templateFileName: n.templateFileName,
        templateFileMimeType: n.templateFileMimeType,
        templateFileData: n.templateFileData,
        templateFileSize: n.templateFileSize,
        pandadocTemplateUuid: n.pandadocTemplateUuid,
      }))
    )
    .returning({ id: dealClientNeeds.id });

  await copyQuestionsToNewNeeds(
    toAdd.map((n, i) => ({ dealNeedId: inserted[i].id, catalogClientNeedId: n.id, needType: n.needType }))
  );

  return toAdd.length;
}

// The three-layer resolution, broad to narrow: every loan (isGlobal) → every
// loan of this product's category (categoryClientNeeds) → this specific
// lender's product (productClientNeeds). A later, narrower layer never
// removes anything from an earlier one — this is a union, deduped by
// catalog id (a need could technically appear in more than one layer).
async function resolveClientNeedsForProduct(productId: string): Promise<CatalogNeedRow[]> {
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
    columns: { category: true },
  });
  if (!product) return [];

  const [globalNeeds, categoryLinks, productLinks] = await Promise.all([
    db.query.clientNeeds.findMany({ where: eq(clientNeeds.isGlobal, true) }),
    db.query.categoryClientNeeds.findMany({
      where: eq(categoryClientNeeds.category, product.category),
      with: { clientNeed: true },
    }),
    db.query.productClientNeeds.findMany({ where: eq(productClientNeeds.productId, productId), with: { clientNeed: true } }),
  ]);

  const byId = new Map<string, CatalogNeedRow>();
  for (const n of globalNeeds) byId.set(n.id, n);
  for (const l of categoryLinks) byId.set(l.clientNeed.id, l.clientNeed);
  for (const l of productLinks) byId.set(l.clientNeed.id, l.clientNeed);
  return [...byId.values()];
}

// Copies the full 3-layer checklist (global + this product's category +
// this specific lender's product) onto a deal — used when a term sheet is
// accepted. Skips items that already exist on the deal by name.
export async function populateClientNeedsFromProduct(dealId: string, productId: string) {
  const catalogNeeds = await resolveClientNeedsForProduct(productId);
  return addCatalogNeedsToDeal(dealId, catalogNeeds);
}

// The "Auto Generate" button's entry point — same 3-layer resolution, just
// requireUser()-gated and revalidating since it's called directly from a
// client component instead of only from server-side acceptance logic.
export async function autoGenerateClientNeedsForProduct(dealId: string, productId: string) {
  await requireUser();
  const catalogNeeds = await resolveClientNeedsForProduct(productId);
  if (!catalogNeeds.length) {
    throw new Error("No client needs are set up for this loan category or lender yet.");
  }
  const added = await addCatalogNeedsToDeal(dealId, catalogNeeds);
  revalidatePath(`/deals/${dealId}/loan-center`);
  return { added, total: catalogNeeds.length };
}

// Maps the standard questionnaire needs' question text onto the discrete,
// independently-editable deal columns those needs exist to fill — a one-time
// copy on Accept, not a live binding (see updateTitleContact/
// updateInsuranceContact in src/server/actions/deals.ts for the manual-edit
// path a processor uses afterward, or when there's no client need at all).
const KEY_CONTACT_FIELD_MAP: Record<string, Record<string, string>> = {
  "Title Info": {
    "Title Company / Agent Name": "titleCompanyAgentName",
    "Title Agent Email": "titleAgentEmail",
    "Title Agent Phone Number": "titleAgentPhone",
  },
  "Insurance Contact Info": {
    "Insurance Agency": "insuranceAgency",
    "Agent Name": "insuranceAgentName",
    "Agent Email": "insuranceAgentEmail",
    "Agent Phone Number": "insuranceAgentPhone",
  },
};

// For esign/questionnaire needs only — document_upload needs derive their
// status from dealClientNeedDocuments (see src/server/actions/client-need-documents.ts)
// and shouldn't be toggled directly.
export async function markNonDocumentNeedAccepted(dealId: string, needId: string) {
  await requireUser();
  const need = await db.query.dealClientNeeds.findFirst({
    where: eq(dealClientNeeds.id, needId),
    with: { answers: true },
  });

  await db.update(dealClientNeeds).set({ status: "accepted" }).where(eq(dealClientNeeds.id, needId));

  const fieldMap = need ? KEY_CONTACT_FIELD_MAP[need.itemName] : undefined;
  if (need && fieldMap) {
    const updates: Record<string, string> = {};
    for (const a of need.answers) {
      const column = fieldMap[a.questionText];
      if (column && a.answerText) updates[column] = a.answerText;
    }
    if (Object.keys(updates).length) {
      await db.update(deals).set(updates).where(eq(deals.id, dealId));
    }
  }

  revalidatePath(`/deals/${dealId}/loan-center`);
}

export async function reopenNonDocumentNeed(dealId: string, needId: string) {
  await requireUser();
  const need = await db.query.dealClientNeeds.findFirst({ where: eq(dealClientNeeds.id, needId) });
  await db
    .update(dealClientNeeds)
    .set({ status: need?.sentAt ? "awaiting_docs" : "not_sent" })
    .where(eq(dealClientNeeds.id, needId));
  revalidatePath(`/deals/${dealId}/loan-center`);
}

// "Select from List" on a deal — copies the name/description of each chosen
// catalog item onto the deal's checklist. Deal-level tracking is a plain
// snapshot (no live link back to the catalog), matching how term-sheet
// acceptance already populates a deal's checklist from a product.
export async function addCatalogItemsToDeal(dealId: string, formData: FormData) {
  await requireUser();
  const ids = formData.getAll("clientNeedId").filter((v): v is string => typeof v === "string" && v.length > 0);
  if (!ids.length) return;

  const selected = await db.query.clientNeeds.findMany({ where: (cn, { inArray }) => inArray(cn.id, ids) });
  await addCatalogNeedsToDeal(dealId, selected);
  revalidatePath(`/deals/${dealId}/loan-center`);
}

// The deal's "Custom Need" tab — full parity with the catalog's own create
// form (needType, questionnaire questions, a link URL, or a downloadable
// template file), since a one-off custom need is still just a catalog entry
// (isCustom: true unless "Standard" is checked) that happens to get copied
// onto this one deal immediately. Reuses createClientNeed so there's exactly
// one place that knows how to build a catalog row from this form.
export async function addClientNeedToDeal(dealId: string, formData: FormData) {
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId), columns: { productId: true } });
  const created = await createClientNeed(formData, { attachToProductId: deal?.productId ?? undefined });
  await addCatalogNeedsToDeal(dealId, [created]);

  revalidatePath(`/deals/${dealId}/loan-center`);
  if (formData.get("isStandard") === "on") revalidatePath("/client-needs");
  return created;
}

// Edits this deal's own copy only — same "plain snapshot" model as
// addClientNeedToDeal above, so this never touches the shared catalog.
export async function updateClientNeed(dealId: string, needId: string, formData: FormData) {
  await requireUser();
  const itemName = formData.get("itemName");
  const description = formData.get("description");
  if (typeof itemName !== "string" || !itemName.trim()) {
    throw new Error("Item name can't be empty");
  }

  await db
    .update(dealClientNeeds)
    .set({
      itemName: itemName.trim(),
      description: typeof description === "string" && description.trim() ? description.trim() : null,
    })
    .where(and(eq(dealClientNeeds.id, needId), eq(dealClientNeeds.dealId, dealId)));

  revalidatePath(`/deals/${dealId}/loan-center`);
}

// Deleting a need also deletes any documents already uploaded against it
// (FK cascade) — the confirm dialog in the UI warns about that.
export async function deleteClientNeedFromDeal(dealId: string, needId: string) {
  await requireUser();
  await db.delete(dealClientNeeds).where(and(eq(dealClientNeeds.id, needId), eq(dealClientNeeds.dealId, dealId)));
  revalidatePath(`/deals/${dealId}/loan-center`);
}

const NEED_STATUS_LABEL: Record<string, string> = {
  not_sent: "Not Sent",
  awaiting_docs: "Awaiting Docs",
  review_needed: "Review Needed",
};

// A plain, deterministic status pull (no AI) — a processor clicks "Pull
// Client Need Context" to drop a factual snapshot into a note before editing
// it further, rather than typing the whole rundown by hand every time.
export async function buildClientNeedsContextNote(dealId: string): Promise<string> {
  await requireUser();

  const needs = await db.query.dealClientNeeds.findMany({
    where: eq(dealClientNeeds.dealId, dealId),
    with: { documents: { columns: { fileName: true, createdAt: true } } },
    orderBy: (n, { asc }) => asc(n.createdAt),
  });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const receivedToday: string[] = [];
  for (const need of needs) {
    const docsToday = need.documents.filter((d) => d.createdAt >= todayStart);
    if (docsToday.length > 0) {
      receivedToday.push(`${need.itemName} (${docsToday.map((d) => d.fileName).join(", ")})`);
    }
  }

  const outstanding = needs.filter((n) => n.status !== "accepted");
  const accepted = needs.filter((n) => n.status === "accepted");

  const lines: string[] = [
    `Client Needs Status — ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
    "",
  ];

  if (receivedToday.length > 0) {
    lines.push("Received today:");
    lines.push(...receivedToday.map((r) => `- ${r}`));
    lines.push("");
  }

  if (outstanding.length > 0) {
    lines.push("Still outstanding:");
    lines.push(...outstanding.map((n) => `- ${n.itemName} (${NEED_STATUS_LABEL[n.status] ?? n.status})`));
    lines.push("");
  } else if (needs.length > 0) {
    lines.push("Nothing outstanding — every client need is accepted.");
    lines.push("");
  }

  lines.push(`Summary: ${accepted.length} accepted, ${outstanding.length} outstanding, ${needs.length} total.`);

  return lines.join("\n");
}
