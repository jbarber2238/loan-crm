import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/server/db/client";
import { dealClientNeedDocuments, dealClientNeeds, deals } from "@/server/db/schema";
import { fileToContentBlock } from "@/server/ai/file-content-block";
import { cleanFacts, docFactKindForNeed, type DocFactKind, type DocFacts } from "@/lib/doc-facts";

// Reads a few specific facts off a purchase agreement or a mortgage payoff statement and stores them, with page
// numbers, for a person to review. It never changes the deal itself. Not a "use server" file on purpose: the upload
// paths (including the borrower's public upload link, which has no signed-in user) call it directly.

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

const MAX_REQUEST_CHARS = 28 * 1024 * 1024;

const INSTRUCTIONS: Record<DocFactKind, string> = {
  purchase_contract: `These document(s) are a real estate purchase agreement for the property, possibly with addenda, amendments or extensions. Read them together and report:
- purchasePrice: the purchase price, as a plain number (no $ or commas). If an amendment changes it, use the newest figure.
- closingDate: the CURRENT closing date, as YYYY-MM-DD. If an addendum, amendment or extension moves the closing date, use the newest one (the latest signed change that sets a date). Do not use an effective date, an offer date or an inspection or financing deadline.
- buyerName: the buyer / purchaser named on the contract, exactly as written. If both an entity and an individual appear for the buyer, give the entity.`,
  payoff_statement: `This document is a mortgage payoff statement or payoff letter. Report:
- totalPayoff: the total amount needed to pay the loan off in full, as a plain number (no $ or commas). Use the total payoff figure, not the principal balance alone.
- expirationDate: the date the payoff quote expires or is good through, as YYYY-MM-DD. If the statement shows a per-diem and a good-through date, give that good-through date. Null if the statement gives no such date.`,
};

const FIELD_KEYS: Record<DocFactKind, string[]> = {
  purchase_contract: ["purchasePrice", "closingDate", "buyerName"],
  payoff_statement: ["totalPayoff", "expirationDate"],
};

function systemPrompt(kind: DocFactKind, documentCount: number): string {
  const shape = FIELD_KEYS[kind].map((k) => `"${k}": {"value": <string or null>, "page": <number or null>}`).join(", ");
  return `You read mortgage loan documents and pull out specific facts for a loan processor to review. ${documentCount === 1 ? "One document is attached" : `${documentCount} documents are attached, labeled "Document 1", "Document 2" and so on`}.

${INSTRUCTIONS[kind]}

For each fact, give the 1-indexed page number (within the document it came from) where it is actually stated. If a fact genuinely isn't in the documents, its value must be null and its page null. Never guess and never calculate a date.

Respond with ONLY a JSON object, no other text: {"document": <1-indexed number of the document the facts mainly came from>, ${shape}}`;
}

/** The model call itself: documents in, cleaned facts (and which document they came from) out. Null if the answer wasn't usable. */
export async function readFactsFromBlocks(
  kind: DocFactKind,
  docs: { fileName: string; block: Anthropic.ContentBlockParam }[],
): Promise<{ document: number; fields: DocFacts["fields"] } | null> {
  if (!anthropic) return null;
  const content: Anthropic.ContentBlockParam[] = docs.flatMap((d, i) => [{ type: "text" as const, text: `Document ${i + 1}: ${d.fileName}` }, d.block]);
  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1500,
    thinking: { type: "adaptive" },
    // Not yet in this SDK version's types, supported by the API (same as the document review call).
    ...({ output_config: { effort: "medium" } } as object),
    system: systemPrompt(kind, docs.length),
    messages: [{ role: "user", content }],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const document = typeof parsed.document === "number" && parsed.document >= 1 && parsed.document <= docs.length ? parsed.document : 1;
  return { document, fields: cleanFacts(kind, parsed) };
}

export type ScanResult = { scanned: false; reason: string } | { scanned: true; kind: DocFactKind };

/** Scans the documents on one client need if it is a purchase agreement or payoff need. Safe to call for any need. */
export async function scanKeyDocuments(dealId: string, needId: string): Promise<ScanResult> {
  const need = await db.query.dealClientNeeds.findFirst({ where: eq(dealClientNeeds.id, needId), columns: { itemName: true, dealId: true } });
  if (!need || need.dealId !== dealId) return { scanned: false, reason: "Need not found." };
  const kind = docFactKindForNeed(need.itemName);
  if (!kind) return { scanned: false, reason: "Not a purchase agreement or payoff need." };
  if (!anthropic) return { scanned: false, reason: "AI isn't configured." };

  const documents = await db.query.dealClientNeedDocuments.findMany({
    where: and(eq(dealClientNeedDocuments.clientNeedId, needId), ne(dealClientNeedDocuments.reviewStatus, "rejected")),
    columns: { id: true, fileName: true, mimeType: true, data: true },
    orderBy: (d, { asc }) => asc(d.createdAt),
  });

  const usable: { id: string; fileName: string; block: Anthropic.ContentBlockParam }[] = [];
  let chars = 0;
  for (const d of documents) {
    const block = fileToContentBlock({ fileName: d.fileName, mimeType: d.mimeType, dataBase64: d.data });
    if (!block || chars + d.data.length > MAX_REQUEST_CHARS) continue;
    chars += d.data.length;
    usable.push({ id: d.id, fileName: d.fileName, block });
  }
  if (!usable.length) return { scanned: false, reason: "No readable documents." };

  const read = await readFactsFromBlocks(kind, usable.map((d) => ({ fileName: d.fileName, block: d.block })));
  if (!read) return { scanned: false, reason: "Couldn't read the AI's answer." };
  const docNumber = read.document;
  const facts: DocFacts = { kind, scannedAt: new Date().toISOString(), fields: read.fields };

  // The facts live on whichever document they came from; older scans on this need's other documents are cleared so
  // there is only ever one current set per need.
  await Promise.all(
    usable.map((d, i) =>
      db.update(dealClientNeedDocuments).set({ aiDocFacts: i + 1 === docNumber ? facts : null }).where(eq(dealClientNeedDocuments.id, d.id)),
    ),
  );
  revalidatePath(`/deals/${dealId}/loan-center`);
  return { scanned: true, kind };
}

/** Called right after a document is uploaded. Never throws: the upload already succeeded and that's what matters. */
export async function autoScanAfterUpload(dealId: string, needId: string): Promise<void> {
  try {
    await scanKeyDocuments(dealId, needId);
  } catch (err) {
    console.error("Auto-scan of an uploaded document failed:", err);
  }
}

/** Deal values the scan is compared against. */
export async function dealFileFacts(dealId: string) {
  const deal = await db.query.deals.findFirst({
    where: eq(deals.id, dealId),
    columns: { purchasePrice: true, borrowerName: true, borrowerEntityName: true, estimatedClosingDate: true, payoffExpirationDate: true },
  });
  return deal ?? null;
}
