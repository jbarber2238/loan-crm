"use server";

import { eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/server/db/client";
import { deals, pricingRequestReplyAttachments, pricingRequests } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { termSheetFieldsFor, type TermSheetField } from "@/lib/term-sheet-fields";
import { detectImageMediaType } from "@/server/ai/image-media-type";
import { valueBasisFor } from "@/lib/term-sheet-calculations";

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

// quotedLtvPercent is internal to this module — extractTermSheetFromReply
// consumes it to back into loanAmount and never exposes it to the caller.
interface RawExtractionResult extends TermSheetExtractionResult {
  quotedLtvPercent: number | null;
}

function fieldListDescription(fields: TermSheetField[]): string {
  return fields
    .map((f) => `- ${f.key} ("${f.label}", type: ${f.type}${f.options ? `, one of: ${f.options.join(" | ")}` : ""})`)
    .join("\n");
}

async function runExtraction(
  contentBlocks: Anthropic.ContentBlockParam[],
  category: string
): Promise<RawExtractionResult> {
  if (!anthropic) {
    throw new Error("AI extraction isn't configured (missing ANTHROPIC_API_KEY).");
  }

  const fieldDefs = termSheetFieldsFor(category);

  const systemPrompt = `You are helping a mortgage processor read a lender's pricing reply (email text, and possibly a term sheet PDF or a screenshot of a spreadsheet) and pull out the loan terms into a structured form.

Target fields for this loan category:
${fieldListDescription(fieldDefs)}

Respond with ONLY a JSON object, no prose outside it, in this exact shape:
{"fields": {"<key>": <value>, ...}, "notFoundKeys": ["<key>", ...], "notes": "<string or null>", "quotedLtvPercent": <number or null>}

Rules:
- Only include a key in "fields" if you're reasonably confident you found it in the reply (text or attachments). Every lender formats these differently — read carefully across all the content provided, including tables and screenshots.
- For "currency"/"number"/"percent" type fields, return a plain number (no $ sign, no % sign, no commas).
- For "select" type fields, return one of the listed options exactly as written.
- List every target field key you could NOT find in "notFoundKeys" — don't guess or invent a value.
- Do not include any field key that isn't in the target field list above.

Loan amount vs. a quoted LTV: lenders sometimes price a refinance or a DSCR purchase as a percentage — "75% LTV cash-out," "we can go up to 80% LTV" — instead of, or without also giving, an actual dollar loan amount. If loanAmount is explicitly stated as a dollar figure, use that as normal. If it is NOT, but the lender's reply (for the same pricing option you're extracting) states an LTV percentage instead, put that percentage as a plain number in the top-level "quotedLtvPercent" field (not inside "fields") — the loan amount will be computed separately from the deal's own value basis. Leave "quotedLtvPercent" null if the lender didn't quote a percentage at all, or if you already found a dollar loanAmount.

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

  let parsed: {
    fields?: Record<string, unknown>;
    notFoundKeys?: unknown;
    notes?: unknown;
    quotedLtvPercent?: unknown;
  };
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

  const quotedLtvPercent =
    typeof parsed.quotedLtvPercent === "number" && Number.isFinite(parsed.quotedLtvPercent)
      ? parsed.quotedLtvPercent
      : null;

  return { fields, foundKeys: Object.keys(fields), notFoundKeys, notes, quotedLtvPercent };
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

  const { quotedLtvPercent, ...result } = await runExtraction(contentBlocks, category);

  // The lender quoted an LTV percentage instead of a dollar loan amount —
  // back into it using the deal's own value basis (as-is value for a
  // refinance, purchase price for a purchase, same basis this term sheet's
  // own LTV will be computed against once it's created, so the two never
  // disagree).
  if (!("loanAmount" in result.fields) && quotedLtvPercent !== null) {
    const deal = await db.query.deals.findFirst({ where: eq(deals.id, request.dealId) });
    const valueBasis = deal
      ? valueBasisFor(
          deal.loanCategory,
          deal.purchasePrice ? Number(deal.purchasePrice) : null,
          deal.estimatedAsIsValue ? Number(deal.estimatedAsIsValue) : null
        )
      : null;

    if (valueBasis !== null) {
      const loanAmount = Math.round(valueBasis * (quotedLtvPercent / 100));
      result.fields.loanAmount = loanAmount;
      result.foundKeys = [...result.foundKeys, "loanAmount"];
      result.notFoundKeys = result.notFoundKeys.filter((k) => k !== "loanAmount");
      const computedNote = `Loan amount computed from the lender's quoted ${quotedLtvPercent}% LTV × $${valueBasis.toLocaleString()} value basis.`;
      result.notes = result.notes ? `${result.notes} ${computedNote}` : computedNote;
    }
  }

  return result;
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

  // No dealId in this flow (no lender email/pricing request to trace back
  // to), so there's no value basis to back a quoted LTV into a loan amount
  // — quotedLtvPercent is simply dropped here.
  const { quotedLtvPercent: _quotedLtvPercent, ...result } = await runExtraction(contentBlocks, category);
  return result;
}
