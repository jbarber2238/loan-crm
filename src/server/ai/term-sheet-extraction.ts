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

export async function extractTermSheetFromReply({
  pricingRequestId,
  category,
}: {
  pricingRequestId: string;
  category: string;
}): Promise<TermSheetExtractionResult> {
  await requireUser();

  if (!anthropic) {
    throw new Error("AI extraction isn't configured (missing ANTHROPIC_API_KEY).");
  }

  const request = await db.query.pricingRequests.findFirst({
    where: eq(pricingRequests.id, pricingRequestId),
  });
  if (!request) throw new Error("Pricing request not found");

  const attachmentRows = await db.query.pricingRequestReplyAttachments.findMany({
    where: eq(pricingRequestReplyAttachments.pricingRequestId, pricingRequestId),
  });

  const replyBodyText = request.replyBodyText ?? "";
  const attachments = attachmentRows.map((a) => ({
    fileName: a.fileName,
    mimeType: a.mimeType,
    dataBase64: a.data,
  }));

  const fieldDefs = termSheetFieldsFor(category);

  const contentBlocks: Anthropic.MessageParam["content"] = [];

  contentBlocks.push({
    type: "text",
    text: `Lender's email reply:\n\n${replyBodyText || "(no plain text body — see attachments)"}`,
  });

  const skipped: string[] = [];
  for (const attachment of attachments) {
    const mime = attachment.mimeType.toLowerCase();
    if (mime === "application/pdf") {
      contentBlocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: attachment.dataBase64 },
      });
    } else if (SUPPORTED_IMAGE_TYPES.has(mime)) {
      contentBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: detectImageMediaType(attachment.dataBase64, mime),
          data: attachment.dataBase64,
        },
      });
    } else {
      skipped.push(attachment.fileName);
    }
  }

  if (skipped.length) {
    contentBlocks.push({
      type: "text",
      text: `(Note: could not read these attachments — unsupported format: ${skipped.join(", ")})`,
    });
  }

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

Do not confuse a lender's "processing fee" with processingFeePaymentLink. processingFeePaymentLink is solely for our OWN separate $999 upfront processing fee, which we charge the borrower before we begin processing — lenders never charge this, never quote it, and never provide a payment link for it themselves. A lender mentioning their own processing fee should only ever affect underwritingDocFee (per the rule above) and should never trigger a note about a "missing payment link" or anything similar — processingFeePaymentLink is something our own staff pastes in manually and is unrelated to anything in the lender's reply.

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
