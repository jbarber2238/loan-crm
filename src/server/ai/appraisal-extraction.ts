"use server";

import { eq } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/server/db/client";
import { deals } from "@/server/db/schema";
import { requireUser } from "@/server/auth/guards";
import { fileToContentBlock } from "@/server/ai/file-content-block";

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// Same category groupings used throughout the term-sheet code (see
// term-sheet-fields.ts, term-sheet.tsx) — a fix-and-flip/new-construction
// appraisal reports as-is value + after-repair value; a DSCR appraisal
// reports as-is value + the 1007 rent schedule's market rent instead.
const HARD_MONEY_DRAW_CATEGORIES = new Set(["fix_and_flip", "new_construction"]);
const DSCR_CATEGORIES = new Set(["dscr_purchase", "dscr_cash_out_refinance", "dscr_rate_term_refinance"]);

export interface AppraisalExtractionResult {
  appraisedValue: number | null;
  /** Only meaningful for fix-and-flip/new-construction. */
  appraisedArv: number | null;
  /** Only meaningful for DSCR/portfolio — surfaced for review, not saved anywhere yet (no home for it on the deal). */
  marketRent: number | null;
  notFound: string[];
}

export async function extractAppraisalData(dealId: string): Promise<AppraisalExtractionResult> {
  if (!anthropic) {
    throw new Error("AI extraction isn't configured (missing ANTHROPIC_API_KEY).");
  }
  await requireUser();

  const deal = await db.query.deals.findFirst({ where: eq(deals.id, dealId) });
  if (!deal) throw new Error("Deal not found");
  if (!deal.appraisalDocumentData || !deal.appraisalDocumentMimeType) {
    throw new Error("Upload the appraisal report first.");
  }

  const block = fileToContentBlock({
    fileName: deal.appraisalDocumentFileName ?? "appraisal",
    mimeType: deal.appraisalDocumentMimeType,
    dataBase64: deal.appraisalDocumentData,
  });
  if (!block) throw new Error("Can't read this file — re-upload as a PDF or image.");

  const isHardMoneyDraw = HARD_MONEY_DRAW_CATEGORIES.has(deal.loanCategory);
  const isDscr = DSCR_CATEGORIES.has(deal.loanCategory) || deal.loanCategory === "portfolio";

  const targetFields = isHardMoneyDraw
    ? `- appraisedValue: the report's as-is value\n- appraisedArv: the report's after-repair value (ARV) — this is a rehab/construction deal, so the appraisal should quote both`
    : isDscr
      ? `- appraisedValue: the report's as-is/current value\n- marketRent: the market rent from the 1007 (or 1025) rent schedule — the appraiser's own rent estimate, not anything the borrower told us`
      : `- appraisedValue: the report's as-is/current value`;

  const systemPrompt = `You are reading a real estate appraisal report to pull out its key figures.

Fields to find:
${targetFields}

Respond with ONLY a JSON object, no prose outside it: {"appraisedValue": <number or null>, "appraisedArv": <number or null>, "marketRent": <number or null>, "notFound": ["<field>", ...]}

Rules:
- Return plain numbers — no $ sign, no commas.
- Only fields relevant to this deal type are listed above; leave the other fields null and don't list them in "notFound".
- List any field from the ones above that you couldn't find in "notFound" rather than guessing.`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 500,
    thinking: { type: "disabled" },
    system: systemPrompt,
    messages: [{ role: "user", content: [{ type: "text", text: "Appraisal report:" }, block] }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Couldn't read this appraisal — try again or enter the values manually.");
  }

  let parsed: { appraisedValue?: unknown; appraisedArv?: unknown; marketRent?: unknown; notFound?: unknown };
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error("Couldn't read this appraisal — try again or enter the values manually.");
  }

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

  return {
    appraisedValue: num(parsed.appraisedValue),
    appraisedArv: isHardMoneyDraw ? num(parsed.appraisedArv) : null,
    marketRent: isDscr ? num(parsed.marketRent) : null,
    notFound: Array.isArray(parsed.notFound) ? parsed.notFound.filter((f): f is string => typeof f === "string") : [],
  };
}
