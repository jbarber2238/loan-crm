"use server";

import { eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/server/db/client";
import { pricingRequestReplyAttachments, pricingRequests } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { termSheetFieldsFor, type TermSheetField } from "@/lib/term-sheet-fields";
import { detectImageMediaType } from "@/server/ai/image-media-type";

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]);

export interface TermSheetExtractionResult {
  fields: Record<string, string | number>;
  foundKeys: string[];
  notFoundKeys: string[];
  notes: string | null;
}

function fieldListDescription(fields: TermSheetField[]): string {
  return fields
    .map((f) => `- ${f.key} ("${f.label}", type: ${f.type}${f.options ? `, one of: ${f.options.join(" | ")}` : ""})`)
    .join("\n");
}

async function runExtraction(
  contentBlocks: Anthropic.ContentBlockParam[],
  category: string
): Promise<TermSheetExtractionResult> {
  if (!anthropic) {
    throw new Error("AI extraction isn't configured (missing ANTHROPIC_API_KEY).");
  }

  const fieldDefs = termSheetFieldsFor(category);

  const systemPrompt = `You are helping a mortgage processor read a lender's pricing reply (email text, and possibly a term sheet PDF or a screenshot of a spreadsheet) and pull out the loan terms into a structured form.

Target fields for this loan category:
${fieldListDescription(fieldDefs)}

Respond with ONLY a JSON object, no prose outside it, in this exact shape:
{"fields": {"<key>": <value>, ...}, "notFoundKeys": ["<key>", ...], "notes": "<string or null>"}

Rules:
- Only include a key in "fields" if you're reasonably confident you found it in the reply (text or attachments). Every lender formats these differently — read carefully across all the content provided, including tables and screenshots.
- For "currency"/"number"/"percent" type fields, return a plain number (no $ sign, no % sign, no commas).
- For "select" type fields, return one of the listed options exactly as written.
- List every target field key you could NOT find in "notFoundKeys" — don't guess or invent a value.
- Do not include any field key that isn't in the target field list above.

Rate + points pricing: lenders very commonly quote as "RATE% and N pt(s)" or "RATE% and N points" (e.g. "6.99% and 1 pt") — this is NOT the same as an origination fee. "N pt(s)" means a discount/buydown fee of N% of the loan amount. When you see this pattern, set interestRate to RATE and convert the points into a dollar amount for costToBorrowerFee (points ÷ 100 × loan amount) — do not leave costToBorrowerFee blank just because the reply never uses the words "rate buydown" or "points fee".

Multiple pricing options: if the lender offers more than one rate/points combination, extract the option with the LOWEST points (or the first one listed if points are equal) as the primary set of numbers for the fields above, and use "notes" to briefly describe the alternate option(s) so the processor can see what else was offered and choose. If there's nothing else worth flagging, set "notes" to null.

Underwriting and Doc Fee: lenders itemize their own closing-cost fees in all kinds of ways — "processing fee," "underwriting fee," "admin fee," "doc prep fee," "doc fee," etc. NONE of these are the same thing as origination points or a rate buydown (handled separately above). Add up every one of these lender-charged fee line items and put the SUM into the single underwritingDocFee field — do not create separate fields for them and do not list them individually in "notes". For example, if the lender's reply mentions a $1,495 underwriting fee and a $745 processing fee, underwritingDocFee should be 2240.

Interest Type (Dutch vs Non-Dutch) on fix-and-flip/new-construction loans: lenders word this very differently from one to the next, so infer it from the STRUCTURE of the payment figures rather than exact wording. If the reply shows TWO payment amounts — an initial/day-1 payment calculated on just the initial advance, alongside a separate maximum/fully-drawn payment calculated on the full loan amount — that pattern means the loan is Non-Dutch (the borrower only pays interest on what's actually been advanced/drawn so far). Lenders phrase this two-payment pattern many different ways: "Day 1 Payment" vs "Payment (Max)", "Initial Payment" vs "Fully Drawn Payment", "Interest-Only Payment (Initial Advance)" vs "Interest-Only Payment (Full Loan Amount)", etc. — look for two distinct interest-payment numbers, one tied to the initial/current advance and one tied to the full/max committed amount. If instead there's only ONE interest payment figure, calculated on the full loan amount from the start, that means the loan is Dutch. Set interestType to "Dutch" or "Non-Dutch" based on this — don't leave it in notFoundKeys just because the lender never uses the words "Dutch" or "Non-Dutch" themselves.

Reserves: DSCR and Portfolio loans use reservesMonths (a number of months, not a dollar amount) — only include it if the lender explicitly states a reserve requirement different from the standard 6 months; otherwise leave it out of "fields" entirely (don't put it in "notFoundKeys" either, since 6 months is already the default). Hard money and bridge loans use reservesRequired (a dollar amount) — lenders describe this as a formula rather than a flat figure (e.g. "10% of loan amount", "25% of the rehab/construction budget", "6 months of payments"), so compute the actual dollar amount using this loan's own numbers (loan amount, rehab/construction budget, etc.) and put that computed figure in reservesRequired.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1500,
    thinking: { type: "disabled" },
    system: systemPrompt,
    messages: [{ role: "user", content: contentBlocks }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Couldn't parse an extraction result from the AI response — try again or enter terms manually.");
  }

  let parsed: { fields?: Record<string, unknown>; notFoundKeys?: unknown; notes?: unknown };
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error("Couldn't parse an extraction result from the AI response — try again or enter terms manually.");
  }

  const validKeys = new Set(fieldDefs.map((f) => f.key));
  const fields: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(parsed.fields ?? {})) {
    if (!validKeys.has(key)) continue;
    if (typeof value === "number" || typeof value === "string") {
      fields[key] = value;
    }
  }

  const notFoundKeys = Array.isArray(parsed.notFoundKeys)
    ? parsed.notFoundKeys.filter((k): k is string => typeof k === "string" && validKeys.has(k))
    : [];

  const notes = typeof parsed.notes === "string" && parsed.notes.trim().length ? parsed.notes.trim() : null;

  return { fields, foundKeys: Object.keys(fields), notFoundKeys, notes };
}

function fileToContentBlock(file: {
  fileName: string;
  mimeType: string;
  dataBase64: string;
}): Anthropic.ContentBlockParam | null {
  const mime = file.mimeType.toLowerCase();
  if (mime === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.dataBase64 } };
  }
  if (SUPPORTED_IMAGE_TYPES.has(mime)) {
    return {
      type: "image",
      source: { type: "base64", media_type: detectImageMediaType(file.dataBase64, mime), data: file.dataBase64 },
    };
  }
  return null;
}

export async function extractTermSheetFromReply({
  pricingRequestId,
  category,
}: {
  pricingRequestId: string;
  category: string;
}): Promise<TermSheetExtractionResult> {
  await requireUser();

  const request = await db.query.pricingRequests.findFirst({
    where: eq(pricingRequests.id, pricingRequestId),
  });
  if (!request) throw new Error("Pricing request not found");

  const attachmentRows = await db.query.pricingRequestReplyAttachments.findMany({
    where: eq(pricingRequestReplyAttachments.pricingRequestId, pricingRequestId),
  });

  const replyBodyText = request.replyBodyText ?? "";

  const contentBlocks: Anthropic.ContentBlockParam[] = [
    { type: "text", text: `Lender's email reply:\n\n${replyBodyText || "(no plain text body — see attachments)"}` },
  ];

  const skipped: string[] = [];
  for (const a of attachmentRows) {
    const block = fileToContentBlock({ fileName: a.fileName, mimeType: a.mimeType, dataBase64: a.data });
    if (block) contentBlocks.push(block);
    else skipped.push(a.fileName);
  }

  if (skipped.length) {
    contentBlocks.push({
      type: "text",
      text: `(Note: could not read these attachments — unsupported format: ${skipped.join(", ")})`,
    });
  }

  return runExtraction(contentBlocks, category);
}

// The quick-pricer flow has no lender email to read — just a screenshot of
// whatever the pricer showed on screen, snapped right after pricing it.
export async function extractTermSheetFromScreenshot({
  category,
  file,
}: {
  category: string;
  file: { fileName: string; mimeType: string; dataBase64: string };
}): Promise<TermSheetExtractionResult> {
  await requireUser();

  const block = fileToContentBlock(file);
  if (!block) {
    throw new Error(`Can't read "${file.fileName}" — upload a PDF or image instead.`);
  }

  const contentBlocks: Anthropic.ContentBlockParam[] = [
    { type: "text", text: "Screenshot of the lender's quick pricer results:" },
    block,
  ];

  return runExtraction(contentBlocks, category);
}
