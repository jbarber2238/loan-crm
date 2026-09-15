"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/server/db/client";
import { deals, dealClientNeeds, dealClientNeedDocuments } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { detectImageMediaType } from "@/server/ai/image-media-type";

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]);

export interface AiReviewFlag {
  page: number | null;
  quote: string;
  concern: string;
}

type Deal = typeof deals.$inferSelect;

function buildDealContextSummary(deal: Deal): string {
  return [
    `Borrower: ${deal.borrowerName}`,
    deal.borrowerEntityName ? `Borrowing Entity: ${deal.borrowerEntityName}` : null,
    `Property Address: ${deal.propertyAddress}`,
    `Requested Loan Amount: $${Number(deal.loanAmountRequested).toLocaleString()}`,
    `Loan Type: ${deal.loanCategory}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function fileToContentBlock(file: { mimeType: string; data: string }): Anthropic.ContentBlockParam | null {
  const mime = file.mimeType.toLowerCase();
  if (mime === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.data } };
  }
  if (SUPPORTED_IMAGE_TYPES.has(mime)) {
    return {
      type: "image",
      source: { type: "base64", media_type: detectImageMediaType(file.data, mime), data: file.data },
    };
  }
  return null;
}

const REVIEW_SYSTEM_PROMPT = (
  dealContext: string,
  itemName: string,
  description: string | null,
  documentCount: number
) => `You are an experienced mortgage loan processor's assistant, reviewing the document(s) a borrower uploaded to satisfy one client-need checklist item. Your job is to flag anything a human reviewer should double-check before accepting them — you are not deciding accept/reject yourself.

Deal context (use this to cross-check the documents — e.g. does the name, entity, or amount actually match what's on file):
${dealContext}

These document(s) were uploaded for the checklist item: "${itemName}"${description ? ` — ${description}` : ""}

There ${documentCount === 1 ? "is 1 document" : `are ${documentCount} documents`} attached, labeled "Document 1", "Document 2", etc. in the order provided. Consider them together, not just individually — e.g. if the checklist implies multiple periods or copies (like two months of bank statements), check whether the full set actually covers what's expected before flagging something as missing.

This lender underwrites on the asset/entity, not the borrower's personal income — DTI (debt-to-income ratio) is never a factor here. Do not calculate, mention, or flag DTI, or anything framed as "verify income supports this debt load" or similar. Ignore that angle entirely, even on bank statements or applications.

General guidance — apply whatever's relevant to these specific documents, skip what isn't:
- Entity documents (operating agreement, articles of organization, corporate resolution, etc.): Is it signed/executed? Are all members/managers clearly identified? Is the borrower actually listed as a member/manager? Does the borrower's ownership percentage look sufficient to bind the entity to debt (majority interest, or explicit signing authority language)?
- Bank statements: Does the account holder name match the borrower or borrowing entity? Do the statement dates, taken together across all documents provided, cover the period requested? Any large unexplained deposits, overdrafts, or NSF fees worth asking about? (Not a DTI check — just source-of-funds and account-identity questions.)
- Applications or loan forms: Does anything here contradict the deal details above (loan amount, property address, borrower name, entity name)? Is any field that looks required left blank?
- Any document: Is a signature or date missing where one is clearly expected? Does a document reference pages that weren't included (e.g. "page 1 of 3" but only one page attached)?

Respond with ONLY a JSON object, no prose outside it, in this exact shape:
{"flags": [{"document": <1-indexed number matching "Document N" above>, "page": <page number within that document, or null>, "quote": "<a short phrase copied closely from the document, near the issue>", "concern": "<one sentence: what to check and why>"}]}

Rules:
- Only flag things genuinely worth a second look. Don't invent issues on a clean set of documents — an empty flags array is a completely valid, good outcome.
- Never flag anything DTI-related — see above. This lender doesn't underwrite on it, so it's not a "second look" item.
- "quote" must be short (under 12 words) and taken directly from the document's actual text near the issue, not paraphrased — it exists to help a human find the spot fast, not to summarize it.
- "page" is the 1-indexed page number within that specific document, or null if it doesn't apply (e.g. a single-page image, or a concern that isn't tied to one page).
- A concern that spans multiple documents (e.g. a missing month) should still be attached to whichever single document is most relevant, with "page" set to null.`;

/** Buckets the model's flags by which "Document N" they were attached to (1-indexed, matching prompt order). */
function parseReviewResponse(raw: string, documentCount: number): Map<number, AiReviewFlag[]> {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Couldn't parse a review result from the AI response.");
  let parsed: { flags?: unknown };
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error("Couldn't parse a review result from the AI response.");
  }

  const byDoc = new Map<number, AiReviewFlag[]>();
  if (!Array.isArray(parsed.flags)) return byDoc;

  for (const raw of parsed.flags) {
    if (typeof raw !== "object" || raw === null) continue;
    const f = raw as { document?: unknown; page?: unknown; quote?: unknown; concern?: unknown };
    const concern = typeof f.concern === "string" ? f.concern : "";
    if (!concern) continue;
    const docIndex =
      typeof f.document === "number" && f.document >= 1 && f.document <= documentCount ? f.document : 1;
    const flag: AiReviewFlag = {
      page: typeof f.page === "number" ? f.page : null,
      quote: typeof f.quote === "string" ? f.quote : "",
      concern,
    };
    byDoc.set(docIndex, [...(byDoc.get(docIndex) ?? []), flag]);
  }
  return byDoc;
}

interface ReviewNeedResult {
  reviewedIds: string[];
  skipped: { id: string; error: string }[];
  totalFlags: number;
}

/** Reviews every (supported) document in a need together, in one call, so the model has cross-document context — e.g. whether two bank statements together cover the requested period. */
async function reviewNeed(
  documents: { id: string; fileName: string; mimeType: string; data: string }[],
  need: { itemName: string; description: string | null },
  dealContext: string
): Promise<ReviewNeedResult> {
  if (!anthropic) {
    return {
      reviewedIds: [],
      skipped: documents.map((d) => ({ id: d.id, error: "AI review isn't configured." })),
      totalFlags: 0,
    };
  }

  const supported: { id: string; fileName: string; block: Anthropic.ContentBlockParam }[] = [];
  const skipped: { id: string; error: string }[] = [];
  for (const doc of documents) {
    const block = fileToContentBlock(doc);
    if (block) supported.push({ id: doc.id, fileName: doc.fileName, block });
    else skipped.push({ id: doc.id, error: "Unsupported file type for AI review." });
  }
  if (!supported.length) return { reviewedIds: [], skipped, totalFlags: 0 };

  const contentBlocks: Anthropic.ContentBlockParam[] = supported.flatMap(({ fileName, block }, i) => [
    { type: "text", text: `Document ${i + 1}: ${fileName}` },
    block,
  ]);

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      thinking: { type: "disabled" },
      system: REVIEW_SYSTEM_PROMPT(dealContext, need.itemName, need.description, supported.length),
      messages: [{ role: "user", content: contentBlocks }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const byDoc = parseReviewResponse(raw, supported.length);

    let totalFlags = 0;
    await Promise.all(
      supported.map(({ id }, i) => {
        const flags = byDoc.get(i + 1) ?? [];
        totalFlags += flags.length;
        return db
          .update(dealClientNeedDocuments)
          .set({ aiReviewFlags: { flags }, aiReviewedAt: new Date() })
          .where(eq(dealClientNeedDocuments.id, id));
      })
    );

    return { reviewedIds: supported.map((s) => s.id), skipped, totalFlags };
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI review failed for this need.";
    return { reviewedIds: [], skipped: [...skipped, ...supported.map((s) => ({ id: s.id, error: message }))], totalFlags: 0 };
  }
}

/** Runs AI review on every document within a single client need, together in one call. */
export async function reviewClientNeedDocuments(dealId: string, needId: string, documentIds?: string[]) {
  await requireUser();

  const [deal, need] = await Promise.all([
    db.query.deals.findFirst({ where: eq(deals.id, dealId) }),
    db.query.dealClientNeeds.findFirst({ where: eq(dealClientNeeds.id, needId) }),
  ]);
  if (!deal) throw new Error("Deal not found");
  if (!need) throw new Error("Client need not found");

  const documents = await db.query.dealClientNeedDocuments.findMany({
    where: documentIds?.length
      ? inArray(dealClientNeedDocuments.id, documentIds)
      : eq(dealClientNeedDocuments.clientNeedId, needId),
    columns: { id: true, fileName: true, mimeType: true, data: true },
  });
  if (!documents.length) throw new Error("No documents to review");

  const dealContext = buildDealContextSummary(deal);
  const result = await reviewNeed(documents, need, dealContext);

  revalidatePath(`/deals/${dealId}/loan-center`);

  return {
    reviewed: result.reviewedIds.length,
    skipped: result.skipped.length,
    totalFlags: result.totalFlags,
    errors: result.skipped.map((s) => s.error).filter(Boolean),
  };
}

/** Runs AI review across every document-bearing client need on the deal — one call per need, so each need keeps its own cross-document context. */
export async function reviewAllClientNeedDocumentsForDeal(dealId: string) {
  await requireUser();

  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) throw new Error("Deal not found");

  const needs = await db.query.dealClientNeeds.findMany({
    where: eq(dealClientNeeds.dealId, dealId),
    columns: { id: true, itemName: true, description: true, needType: true },
    with: { documents: { columns: { id: true, fileName: true, mimeType: true, data: true } } },
  });

  const reviewableNeeds = needs.filter(
    (n) => (n.needType === "document_upload" || n.needType === "pandadoc_form") && n.documents.length > 0
  );
  if (!reviewableNeeds.length) throw new Error("No uploaded documents on this deal to review yet");

  const dealContext = buildDealContextSummary(deal);
  const results = await Promise.all(
    reviewableNeeds.map((need) => reviewNeed(need.documents, need, dealContext))
  );

  revalidatePath(`/deals/${dealId}/loan-center`);

  const reviewed = results.reduce((sum, r) => sum + r.reviewedIds.length, 0);
  const skipped = results.reduce((sum, r) => sum + r.skipped.length, 0);
  const totalFlags = results.reduce((sum, r) => sum + r.totalFlags, 0);
  return { reviewed, skipped, totalFlags };
}

/** Answers an ad-hoc question about every document in a client need — stateless, no chat history kept. */
export async function askAboutClientNeedDocuments(dealId: string, needId: string, question: string) {
  await requireUser();
  if (!question.trim()) throw new Error("Ask a question first");

  const [deal, need] = await Promise.all([
    db.query.deals.findFirst({ where: eq(deals.id, dealId) }),
    db.query.dealClientNeeds.findFirst({ where: eq(dealClientNeeds.id, needId) }),
  ]);
  if (!deal) throw new Error("Deal not found");
  if (!need) throw new Error("Client need not found");
  if (!anthropic) throw new Error("AI review isn't configured (missing ANTHROPIC_API_KEY).");

  const documents = await db.query.dealClientNeedDocuments.findMany({
    where: eq(dealClientNeedDocuments.clientNeedId, needId),
    columns: { fileName: true, mimeType: true, data: true },
  });
  if (!documents.length) throw new Error("No documents on this need to ask about");

  const readable = documents
    .map((d) => ({ fileName: d.fileName, block: fileToContentBlock(d) }))
    .filter((d): d is { fileName: string; block: Anthropic.ContentBlockParam } => d.block !== null);
  if (!readable.length) throw new Error("These documents aren't in a format the AI can read");

  const contentBlocks: Anthropic.ContentBlockParam[] = readable.flatMap(({ fileName, block }, i) => [
    { type: "text", text: `Document ${i + 1}: ${fileName}` },
    block,
  ]);

  const dealContext = buildDealContextSummary(deal);
  const systemPrompt = `You are helping a mortgage processor answer a question about the document(s) attached to one client-need checklist item on a loan file.

Deal context:
${dealContext}

Checklist item: "${need.itemName}"${need.description ? ` — ${need.description}` : ""}

${readable.length} document(s) are attached, labeled "Document 1", "Document 2", etc.

This lender underwrites on the asset/entity, not the borrower's personal income — DTI (debt-to-income ratio) is never a factor here. If asked about it, or if it seems relevant to a question, say plainly that DTI isn't part of this lender's underwriting rather than calculating or discussing it.

Keep your answer SHORT — a processor is reading this mid-workflow, not requesting a report. One or two sentences, almost always:
- Lead with the answer itself, in plain terms — a yes/no question gets "Yes" or "No" as the first word.
- Back it up with the one number or fact that matters, and a document/page citation if it helps them go check. Do not show your arithmetic or list every line item you added up — state the result, not the calculation.
- Don't restate the question, don't summarize the document beyond what's needed, don't add caveats or disclaimers unless they're directly relevant to the answer.
- If the documents don't contain enough information to answer, say so in one sentence rather than guessing or padding.

Example of the length and style to match: "Yes — ending balance was $26,991 as of 8/31/26 (Document 1), above the $20,000 requirement." That is the full answer, not the first sentence of a longer one.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 400,
    thinking: { type: "disabled" },
    system: systemPrompt,
    messages: [{ role: "user", content: [...contentBlocks, { type: "text", text: question.trim() }] }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const answer = textBlock && textBlock.type === "text" ? textBlock.text : "";
  if (!answer) throw new Error("Didn't get an answer back — try again.");
  return { answer };
}
