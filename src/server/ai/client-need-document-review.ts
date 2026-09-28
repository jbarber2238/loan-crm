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

export interface OperatingAgreementFacts {
  entityName: { value: string | null; page: number | null };
  managerName: { value: string | null; page: number | null };
  effectiveDate: { value: string | null; page: number | null };
  ownershipBreakdown: { value: string | null; page: number | null };
  principalOffice: { value: string | null; page: number | null };
  signatureType: { value: string | null; page: number | null };
  unanimousConsentClause: { value: string | null; page: number | null };
}

const FACT_KEYS = [
  "entityName",
  "managerName",
  "effectiveDate",
  "ownershipBreakdown",
  "principalOffice",
  "signatureType",
  "unanimousConsentClause",
] as const;

/** Matches by substring, not an exact catalog name, since this item may be worded slightly differently across lenders/products. */
function isOperatingAgreementNeed(itemName: string): boolean {
  return itemName.toLowerCase().includes("operating agreement");
}

type Deal = typeof deals.$inferSelect;

function buildDealContextSummary(deal: Deal): string {
  return [
    // The model's own sense of "today" comes from training data and is
    // unreliable — without this, it has flagged real, ordinary dates as
    // suspiciously "in the future." Always give it the actual current date
    // to reason against instead.
    `Today's Date: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
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

const OPERATING_AGREEMENT_FACTS_INSTRUCTIONS = `

This checklist item is an LLC Operating Agreement, so — separately from the flags above, and regardless of whether anything looks wrong — always pull these specific facts, each with the page number (within whichever "Document N" it came from) where it's actually stated:
- entityName: the LLC's full legal name.
- managerName: the name(s) of the Manager(s) if manager-managed, or the Managing Member(s) if member-managed. If more than one, list all of them in one string.
- effectiveDate: the agreement's stated effective or execution date.
- ownershipBreakdown: every member's name with their ownership percentage or unit count, as one combined string (e.g. "Jane Doe 60%, John Smith 40%").
- principalOffice: the entity's stated principal office address.
- signatureType: whether the signature page shows a wet (physical ink) signature or an electronic one (DocuSign, Adobe Sign, a typed "/s/" signature block, or an attached signature certificate/audit trail) — answer exactly one of "Wet signature", "E-signed", or "Not signed" (if the signature page is blank/unsigned).
- unanimousConsentClause: whether the agreement contains a clause requiring unanimous member consent for major decisions — answer exactly one of "Yes", "No", or "Not addressed", and if "Yes", briefly name what kind of decisions it applies to inside the same string (e.g. "Yes — sale of the property or additional capital calls").

If a fact genuinely can't be found anywhere in the document, its value must be null (with page also null) — never guess, and never leave a fact out of the object entirely.`;

const REVIEW_SYSTEM_PROMPT = (
  dealContext: string,
  itemName: string,
  description: string | null,
  documentCount: number,
  extractOperatingAgreementFacts: boolean
) => `You are an experienced mortgage loan processor's assistant, reviewing the document(s) a borrower uploaded to satisfy one client-need checklist item. Your job is to flag anything a human reviewer should double-check before accepting them — you are not deciding accept/reject yourself.

Deal context (use this to cross-check the documents — e.g. does the name, entity, or amount actually match what's on file):
${dealContext}

These document(s) were uploaded for the checklist item: "${itemName}"${description ? ` — ${description}` : ""}

There ${documentCount === 1 ? "is 1 document" : `are ${documentCount} documents`} attached, labeled "Document 1", "Document 2", etc. in the order provided. Consider them together, not just individually — e.g. if the checklist implies multiple periods or copies (like two months of bank statements), check whether the full set actually covers what's expected before flagging something as missing.

This lender underwrites on the asset/entity, not the borrower's personal income — DTI (debt-to-income ratio) is never a factor here. Do not calculate, mention, or flag DTI, or anything framed as "verify income supports this debt load" or similar. Ignore that angle entirely, even on bank statements or applications.

General guidance — apply whatever's relevant to these specific documents, skip what isn't:
- Schedule of Real Estate Owned (REO): this document exists to prove the borrower's ownership and track record, so the single most important check is title/vesting on EVERY property row, not just the subject property in "Property Address" above. For each property titled to an entity or person that is NOT the Borrowing Entity (or borrower) already on file, flag that specific entity by name: we don't have that entity's formation documents, so we can't yet credit that property as the borrower's real experience, and proof of the entity (and the borrower's relationship to it) needs to be requested. If the same unfamiliar entity holds more than one property on the schedule, one flag naming that entity covers all of them — don't repeat an identical flag per row. Flag this even if nothing else on the schedule looks wrong.
- Entity documents (operating agreement, articles of organization, corporate resolution, etc.): Is it signed/executed? Are all members/managers clearly identified? Is the borrower actually listed as a member/manager? Does the borrower's ownership percentage look sufficient to bind the entity to debt (majority interest, or explicit signing authority language)?
- Bank statements: Does the account holder name match the borrower or borrowing entity? Do the statement dates, taken together across all documents provided, cover the period requested? Any large unexplained deposits, overdrafts, or NSF fees worth asking about? (Not a DTI check — just source-of-funds and account-identity questions.)
- Applications or loan forms: Does anything here contradict the deal details above (loan amount, property address, borrower name, entity name)? Is any field that looks required left blank?
- Any document: Is a signature or date missing where one is clearly expected? Does a document reference pages that weren't included (e.g. "page 1 of 3" but only one page attached)?
- Never flag a date as "in the future," "doesn't make sense yet," or "ahead of typical timing" — this specific judgment call has repeatedly been wrong even when told today's date, so it's off limits. Only flag a date-related problem when it's a concrete defect unrelated to how recent it looks: it's missing where clearly required, it's internally inconsistent (e.g. an origination date before an application date), or a field is obviously mistyped (like a two-digit year that isn't a real year).
${extractOperatingAgreementFacts ? OPERATING_AGREEMENT_FACTS_INSTRUCTIONS : ""}
Respond with ONLY a JSON object, no prose outside it, in this exact shape:
{"flags": [{"document": <1-indexed number matching "Document N" above>, "page": <page number within that document, or null>, "quote": "<a short phrase copied closely from the document, near the issue>", "concern": "<one sentence: what to check and why>"}]}${
  extractOperatingAgreementFacts
    ? `, "facts": {"document": <1-indexed number matching "Document N" — whichever document these facts actually came from>, "entityName": {"value": <string or null>, "page": <number or null>}, "managerName": {"value": <string or null>, "page": <number or null>}, "effectiveDate": {"value": <string or null>, "page": <number or null>}, "ownershipBreakdown": {"value": <string or null>, "page": <number or null>}, "principalOffice": {"value": <string or null>, "page": <number or null>}, "signatureType": {"value": <string or null>, "page": <number or null>}, "unanimousConsentClause": {"value": <string or null>, "page": <number or null>}}`
    : ""
}

Rules:
- Only flag things genuinely worth a second look. Don't invent issues on a clean set of documents — an empty flags array is a completely valid, good outcome.
- Never flag anything DTI-related — see above. This lender doesn't underwrite on it, so it's not a "second look" item.
- "quote" must be short (under 12 words) and taken directly from the document's actual text near the issue, not paraphrased — it exists to help a human find the spot fast, not to summarize it.
- "page" is the 1-indexed page number within that specific document, or null if it doesn't apply (e.g. a single-page image, or a concern that isn't tied to one page).
- A concern that spans multiple documents (e.g. a missing month) should still be attached to whichever single document is most relevant, with "page" set to null.${
  extractOperatingAgreementFacts ? ' "facts" is required whenever this checklist item is an operating agreement — include it even if every value inside it ends up null.' : ""
}`;

function parseFact(raw: unknown): { value: string | null; page: number | null } {
  if (typeof raw !== "object" || raw === null) return { value: null, page: null };
  const f = raw as { value?: unknown; page?: unknown };
  return {
    value: typeof f.value === "string" && f.value.trim() ? f.value.trim() : null,
    page: typeof f.page === "number" ? f.page : null,
  };
}

/** Buckets the model's flags by which "Document N" they were attached to (1-indexed, matching prompt order), plus the operating-agreement facts block when the prompt asked for one. */
function parseReviewResponse(
  raw: string,
  documentCount: number
): { byDoc: Map<number, AiReviewFlag[]>; facts: { document: number; data: OperatingAgreementFacts } | null } {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Couldn't parse a review result from the AI response.");
  let parsed: { flags?: unknown; facts?: unknown };
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error("Couldn't parse a review result from the AI response.");
  }

  const byDoc = new Map<number, AiReviewFlag[]>();
  if (Array.isArray(parsed.flags)) {
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
  }

  let facts: { document: number; data: OperatingAgreementFacts } | null = null;
  if (typeof parsed.facts === "object" && parsed.facts !== null) {
    const raw = parsed.facts as Record<string, unknown>;
    const docIndex =
      typeof raw.document === "number" && raw.document >= 1 && raw.document <= documentCount ? raw.document : 1;
    const data = Object.fromEntries(FACT_KEYS.map((key) => [key, parseFact(raw[key])])) as unknown as OperatingAgreementFacts;
    facts = { document: docIndex, data };
  }

  return { byDoc, facts };
}

interface ReviewNeedResult {
  reviewedIds: string[];
  skipped: { id: string; error: string }[];
  totalFlags: number;
  factsExtracted: boolean;
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
      factsExtracted: false,
    };
  }

  const supported: { id: string; fileName: string; block: Anthropic.ContentBlockParam }[] = [];
  const skipped: { id: string; error: string }[] = [];
  for (const doc of documents) {
    const block = fileToContentBlock(doc);
    if (block) supported.push({ id: doc.id, fileName: doc.fileName, block });
    else skipped.push({ id: doc.id, error: "Unsupported file type for AI review." });
  }
  if (!supported.length) return { reviewedIds: [], skipped, totalFlags: 0, factsExtracted: false };

  const contentBlocks: Anthropic.ContentBlockParam[] = supported.flatMap(({ fileName, block }, i) => [
    { type: "text", text: `Document ${i + 1}: ${fileName}` },
    block,
  ]);

  const extractFacts = isOperatingAgreementNeed(need.itemName);

  try {
    // Adaptive thinking (not disabled, like every other call in this file) —
    // this call reasons about cross-document/cross-row facts (e.g. an REO
    // schedule's entity-per-property check) more reliably with it on. Model
    // output isn't fully deterministic between calls even with thinking on,
    // which is why "is this date suspiciously futuristic" was dropped from
    // the guidance below entirely rather than more tightly worded — it kept
    // flip-flopping run to run on the same document regardless of wording.
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 2000,
      thinking: { type: "adaptive" },
      // Not yet in this SDK version's types (0.124.0) — supported by the API.
      ...({ output_config: { effort: "medium" } } as object),
      system: REVIEW_SYSTEM_PROMPT(dealContext, need.itemName, need.description, supported.length, extractFacts),
      messages: [{ role: "user", content: contentBlocks }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const { byDoc, facts } = parseReviewResponse(raw, supported.length);

    let totalFlags = 0;
    await Promise.all(
      supported.map(({ id }, i) => {
        const flags = byDoc.get(i + 1) ?? [];
        totalFlags += flags.length;
        // Facts are attached to whichever document the model says they
        // actually came from (usually the only document in this need, but
        // not assumed) — every other document's column is left untouched.
        const isFactsDoc = facts && facts.document === i + 1;
        return db
          .update(dealClientNeedDocuments)
          .set({
            aiReviewFlags: { flags },
            aiReviewedAt: new Date(),
            ...(isFactsDoc ? { aiExtractedFacts: facts.data } : {}),
          })
          .where(eq(dealClientNeedDocuments.id, id));
      })
    );

    return { reviewedIds: supported.map((s) => s.id), skipped, totalFlags, factsExtracted: Boolean(facts) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI review failed for this need.";
    return {
      reviewedIds: [],
      skipped: [...skipped, ...supported.map((s) => ({ id: s.id, error: message }))],
      totalFlags: 0,
      factsExtracted: false,
    };
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
    factsExtracted: result.factsExtracted,
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
  const factsExtracted = results.some((r) => r.factsExtracted);
  return { reviewed, skipped, totalFlags, factsExtracted };
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
