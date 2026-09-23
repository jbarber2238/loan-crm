"use server";

import { eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/server/db/client";
import { deals, pricingRequestReplyAttachments, pricingRequests } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { termSheetFieldsFor, type TermSheetField } from "@/lib/term-sheet-fields";
import { valueBasisFor } from "@/lib/term-sheet-calculations";
import { fileToContentBlock } from "@/server/ai/file-content-block";

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// These three are never the lender's numbers to report — they're our own
// broker-side levers (our origination points/fee, our discretionary rate
// buydown), always set by us and defaulted by the form itself (2%/0%/
// computed). Asking the AI to "find" them in a lender's reply meant it
// sometimes matched onto unrelated text and returned a stray 0, silently
// overriding the form's own sensible default. A lender's own points/fees
// still get captured normally — into costToBorrowerFee (see the "Rate +
// points pricing" rule below) or underwritingDocFee — just never into
// these three.
const BROKER_ONLY_FIELDS = new Set(["originationPoints", "originationFee", "rateBuydownPoints"]);

export interface TermSheetExtractionOption {
  // A short, specific description of what makes this option distinct from
  // the others in the same reply — e.g. "30 Year Fixed, 5-yr step-down PPP
  // @ 7.525%" — so the processor can tell them apart at a glance without
  // re-reading the whole reply.
  label: string;
  fields: Record<string, string | number>;
  foundKeys: string[];
  notFoundKeys: string[];
}

export interface TermSheetExtractionResult {
  options: TermSheetExtractionOption[];
  notes: string | null;
}

// quotedLtvPercent is internal to this module — extractTermSheetFromReply
// consumes it to back into loanAmount and never exposes it to the caller.
interface RawOption {
  label: string;
  fields: Record<string, string | number>;
  notFoundKeys: string[];
  quotedLtvPercent: number | null;
}

interface RawExtractionResult {
  options: RawOption[];
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
): Promise<RawExtractionResult> {
  if (!anthropic) {
    throw new Error("AI extraction isn't configured (missing ANTHROPIC_API_KEY).");
  }

  const fieldDefs = termSheetFieldsFor(category).filter((f) => !BROKER_ONLY_FIELDS.has(f.key));

  const systemPrompt = `You are helping a mortgage processor read a lender's pricing reply (email text, and possibly a term sheet PDF or a screenshot of a spreadsheet) and pull out the loan terms into a structured form.

Target fields for this loan category:
${fieldListDescription(fieldDefs)}

Respond with ONLY a JSON object, no prose outside it, in this exact shape:
{"options": [{"label": "<short description of this specific option>", "fields": {"<key>": <value>, ...}, "notFoundKeys": ["<key>", ...], "quotedLtvPercent": <number or null>}, ...], "notes": "<string or null>"}

Rules:
- Only include a key in an option's "fields" if you're reasonably confident you found it in the reply (text or attachments). Every lender formats these differently — read carefully across all the content provided, including tables and screenshots.
- For "currency"/"number"/"percent" type fields, return a plain number (no $ sign, no % sign, no commas).
- For "select" type fields, return one of the listed options exactly as written.
- List every target field key you could NOT find for that option in its own "notFoundKeys" — don't guess or invent a value.
- Do not include any field key that isn't in the target field list above.
- Top-level "notes" is for anything worth flagging that isn't specific to one option (a caveat, a condition, something odd about the reply). Set it to null if there's nothing to add.

Multiple pricing options: if the lender offers more than one distinct rate/points/program combination, give EACH one its own separate entry in "options" — do not collapse them into a single "primary" one. Give each entry a short, specific "label" naming what makes it distinct: the lender's own program name if they gave one, the amortization/rate type, and the rate itself — e.g. "30 Year Fixed, 5-yr step-down PPP @ 7.525%" or "5/6 ARM PRO, 3-yr fixed PPP @ 7.05%". If the lender only offered one option, "options" still has exactly one entry. Each entry needs its own COMPLETE "fields"/"notFoundKeys"/"quotedLtvPercent" — a fee or term that's identical across every option (like a shared underwriting fee) still gets repeated in each option's own "fields", not factored out.

Loan amount vs. a quoted LTV: lenders sometimes price a refinance or a DSCR purchase as a percentage — "75% LTV cash-out," "we can go up to 80% LTV" — instead of, or without also giving, an actual dollar loan amount. If an option's loanAmount is explicitly stated as a dollar figure, use that as normal. If it is NOT, but the reply states an LTV percentage for that same option instead, put that percentage as a plain number in that option's "quotedLtvPercent" field (not inside "fields") — the loan amount will be computed separately from the deal's own value basis. Leave "quotedLtvPercent" null if that option didn't quote a percentage at all, or if you already found a dollar loanAmount for it.

Rate + points pricing: lenders very commonly quote as "RATE% and N pt(s)" or "RATE% and N points" (e.g. "6.99% and 1 pt") — this is NOT the same as an origination fee. "N pt(s)" means a discount/buydown fee of N% of the loan amount. When you see this pattern, set interestRate to RATE and convert the points into a dollar amount for costToBorrowerFee (points ÷ 100 × loan amount) — do not leave costToBorrowerFee blank just because the reply never uses the words "rate buydown" or "points fee".

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
    options?: unknown;
    notes?: unknown;
  };
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error("Couldn't parse an extraction result from the AI response — try again or enter terms manually.");
  }

  if (!Array.isArray(parsed.options) || parsed.options.length === 0) {
    throw new Error("Couldn't parse an extraction result from the AI response — try again or enter terms manually.");
  }

  const validKeys = new Set(fieldDefs.map((f) => f.key));

  const options: RawOption[] = parsed.options.map((raw, i) => {
    const rawOption = raw as {
      label?: unknown;
      fields?: Record<string, unknown>;
      notFoundKeys?: unknown;
      quotedLtvPercent?: unknown;
    };

    const fields: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(rawOption.fields ?? {})) {
      if (!validKeys.has(key)) continue;
      if (typeof value === "number" || typeof value === "string") {
        fields[key] = value;
      }
    }

    const notFoundKeys = Array.isArray(rawOption.notFoundKeys)
      ? rawOption.notFoundKeys.filter((k): k is string => typeof k === "string" && validKeys.has(k))
      : [];

    const quotedLtvPercent =
      typeof rawOption.quotedLtvPercent === "number" && Number.isFinite(rawOption.quotedLtvPercent)
        ? rawOption.quotedLtvPercent
        : null;

    const label =
      typeof rawOption.label === "string" && rawOption.label.trim() ? rawOption.label.trim() : `Option ${i + 1}`;

    return { label, fields, notFoundKeys, quotedLtvPercent };
  });

  const notes = typeof parsed.notes === "string" && parsed.notes.trim().length ? parsed.notes.trim() : null;

  return { options, notes };
}

// Hard-money draw loans (fix-and-flip/new construction) are almost always
// quoted as two separate pieces — an initial advance and a rehab/
// construction holdback — not as one combined total. If both pieces came
// through but the lender never stated a combined total directly, the total
// loan amount is just their sum; no need to leave it blank for the
// processor to add up by hand. Mutates fields/notFoundKeys in place.
function fillCombinedLoanAmount(
  fields: Record<string, string | number>,
  notFoundKeys: string[]
): { notFoundKeys: string[]; note: string | null } {
  if ("loanAmount" in fields) return { notFoundKeys, note: null };

  const initialAdvance = Number(fields.initialAdvance);
  const rehabCost = Number(fields.approvedRehabCost);
  if (!Number.isFinite(initialAdvance) || !Number.isFinite(rehabCost)) return { notFoundKeys, note: null };

  fields.loanAmount = initialAdvance + rehabCost;
  return {
    notFoundKeys: notFoundKeys.filter((k) => k !== "loanAmount"),
    note: `Total loan amount computed as initial advance ($${initialAdvance.toLocaleString()}) + rehab/construction cost ($${rehabCost.toLocaleString()}).`,
  };
}

// Applies both loanAmount fallbacks (combined draw-loan pieces, then a
// quoted LTV percentage) to one raw option and produces the shape callers
// get back, plus any note about how a number was derived (prefixed with
// the option's own label, since there's more than one option's worth of
// these to fold into the single top-level "notes" string). valueBasis is
// null when there's no deal to compute one from (the quick-pricer flow) —
// a quoted LTV is simply left unresolved there.
function finalizeOption(
  raw: RawOption,
  valueBasis: number | null
): { option: TermSheetExtractionOption; computedNote: string | null } {
  const fields = { ...raw.fields };
  let notFoundKeys = raw.notFoundKeys;
  const notes: string[] = [];

  const combined = fillCombinedLoanAmount(fields, notFoundKeys);
  notFoundKeys = combined.notFoundKeys;
  if (combined.note) notes.push(combined.note);

  if (!("loanAmount" in fields) && raw.quotedLtvPercent !== null && valueBasis !== null) {
    fields.loanAmount = Math.round(valueBasis * (raw.quotedLtvPercent / 100));
    notFoundKeys = notFoundKeys.filter((k) => k !== "loanAmount");
    notes.push(
      `Loan amount computed from the lender's quoted ${raw.quotedLtvPercent}% LTV × $${valueBasis.toLocaleString()} value basis.`
    );
  }

  return {
    option: { label: raw.label, fields, foundKeys: Object.keys(fields), notFoundKeys },
    computedNote: notes.length ? `${raw.label}: ${notes.join(" ")}` : null,
  };
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

  const raw = await runExtraction(contentBlocks, category);

  // Any option might have quoted an LTV percentage instead of a dollar loan
  // amount — back into it using the deal's own value basis (as-is value for
  // a refinance, purchase price for a purchase, same basis this term
  // sheet's own LTV will be computed against once it's created, so the two
  // never disagree).
  const deal = await db.query.deals.findFirst({ where: eq(deals.id, request.dealId) });
  const valueBasis = deal
    ? valueBasisFor(
        deal.loanCategory,
        deal.purchasePrice ? Number(deal.purchasePrice) : null,
        deal.estimatedAsIsValue ? Number(deal.estimatedAsIsValue) : null
      )
    : null;

  const finalized = raw.options.map((o) => finalizeOption(o, valueBasis));
  const notes = [raw.notes, ...finalized.map((f) => f.computedNote)].filter((n): n is string => n !== null);

  return { options: finalized.map((f) => f.option), notes: notes.length ? notes.join(" ") : null };
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
  // — finalizeOption's valueBasis is simply null here, leaving any quoted
  // LTV unresolved.
  const raw = await runExtraction(contentBlocks, category);
  const finalized = raw.options.map((o) => finalizeOption(o, null));
  const notes = [raw.notes, ...finalized.map((f) => f.computedNote)].filter((n): n is string => n !== null);

  return { options: finalized.map((f) => f.option), notes: notes.length ? notes.join(" ") : null };
}
