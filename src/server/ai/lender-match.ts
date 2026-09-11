import { and, eq, isNull } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/server/db/client";
import { lenderDocuments, products } from "@/server/db/schema";
import { extractDocumentText } from "@/server/lender-documents/extract-text";
import { buildDealSummaryForAi } from "@/server/ai/deal-summary";
import { LOAN_CATEGORIES, labelFor } from "@/lib/labels";
import type { deals } from "@/server/db/schema";

type Deal = typeof deals.$inferSelect;

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export interface LenderMatchResult {
  dealFlags: string[];
  matches: {
    lenderName: string;
    productName: string;
    fit: "strong" | "close" | "poor";
    reason: string;
  }[];
  ranAt: string;
}

const SYSTEM_PROMPT = `You are helping a mortgage broker quickly shop a deal to their own lenders. You are given one deal's numbers and every one of the broker's ACTIVE lender products in this deal's specific loan category (each with its own criteria notes and/or excerpts from the lender's rate matrix or guideline documents).

For every product listed, judge it as one of:
- "strong": clearly qualifies against the criteria/documents provided.
- "close": borderline on at least one criterion — say exactly which one and how close.
- "poor": clearly disqualified — say why.

If a product has no criteria or documents on file, or the excerpt doesn't cover something you'd need to judge, say so plainly in "reason" rather than guessing a fit level you can't support.

Also produce a short list of "dealFlags" — general things about this deal worth flagging when shopping it to lenders (e.g. thin experience, non-warrantable property type, foreign national status, recent credit event) — not per-lender judgments, just deal-level facts a lender would want to know up front.

Respond with ONLY a JSON object, no prose outside it, matching this shape exactly:
{"dealFlags": ["short flag", ...], "matches": [{"lenderName": "...", "productName": "...", "fit": "strong"|"close"|"poor", "reason": "one or two sentences, name the deciding criteria"}]}

List every product given to you, even the poor fits — don't omit any. Do not invent lenders or products not listed. Do not invent criteria that weren't provided.`;

function extractJson(text: string): Omit<LenderMatchResult, "ranAt"> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed.matches) || !Array.isArray(parsed.dealFlags)) return null;
    const validFit = new Set(["strong", "close", "poor"]);
    return {
      dealFlags: parsed.dealFlags.filter((f: unknown): f is string => typeof f === "string"),
      matches: parsed.matches
        .filter(
          (m: unknown): m is { lenderName: string; productName: string; fit: string; reason: string } =>
            typeof m === "object" &&
            m !== null &&
            typeof (m as Record<string, unknown>).lenderName === "string" &&
            typeof (m as Record<string, unknown>).productName === "string" &&
            typeof (m as Record<string, unknown>).reason === "string" &&
            validFit.has((m as Record<string, unknown>).fit as string)
        )
        .map((m: { lenderName: string; productName: string; fit: string; reason: string }) => ({
          lenderName: m.lenderName,
          productName: m.productName,
          fit: m.fit as "strong" | "close" | "poor",
          reason: m.reason,
        })),
    };
  } catch {
    return null;
  }
}

export async function runLenderMatch(deal: Deal): Promise<LenderMatchResult> {
  if (!anthropic) {
    throw new Error("AI lender match isn't configured (missing ANTHROPIC_API_KEY).");
  }

  const [activeProducts, masterDocs] = await Promise.all([
    db.query.products.findMany({
      where: and(eq(products.active, true), eq(products.category, deal.loanCategory)),
      with: {
        lender: { with: { documents: true } },
        criteria: true,
        documents: { orderBy: (docs, { desc }) => desc(docs.createdAt) },
      },
    }),
    db.query.lenderDocuments.findMany({
      where: isNull(lenderDocuments.lenderId),
      orderBy: (docs, { desc }) => desc(docs.createdAt),
      limit: 1,
    }),
  ]);

  if (!activeProducts.length) {
    return {
      dealFlags: [],
      matches: [],
      ranAt: new Date().toISOString(),
    };
  }

  const masterDoc = masterDocs[0];
  const masterDocText = masterDoc
    ? await extractDocumentText(masterDoc.fileName, masterDoc.mimeType, masterDoc.data)
    : null;

  const lenderWideTextCache = new Map<string, string | null>();

  const criteriaSummary = (
    await Promise.all(
      activeProducts.map(async (p) => {
        const c = p.criteria;
        const productDocs = p.documents;
        const lenderWideDocs = p.lender.documents
          .filter((d) => d.productId === null)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        let lenderWideText = lenderWideTextCache.get(p.lenderId);
        if (lenderWideText === undefined) {
          const doc = lenderWideDocs[0];
          lenderWideText = doc ? await extractDocumentText(doc.fileName, doc.mimeType, doc.data) : null;
          lenderWideTextCache.set(p.lenderId, lenderWideText);
        }

        const productDoc = productDocs[0];
        const productDocText = productDoc
          ? await extractDocumentText(productDoc.fileName, productDoc.mimeType, productDoc.data)
          : null;

        const parts = [
          c?.otherNotes ? `notes: ${c.otherNotes}` : null,
          lenderWideText ? `lender rate matrix excerpt:\n${lenderWideText}` : null,
          productDocText ? `product document excerpt:\n${productDocText}` : null,
        ].filter(Boolean);

        return `- ${p.lender.name} / ${p.name} (${labelFor(LOAN_CATEGORIES, p.category)}): ${
          parts.join("\n  ") || "no criteria or documents on file"
        }`;
      })
    )
  ).join("\n\n");

  const userContent = `${buildDealSummaryForAi(deal)}
${
  masterDocText
    ? `\nMaster lender matrix (covers every lender/product at a glance — cross-check against the lender-specific details below):\n${masterDocText}\n`
    : ""
}
Active lender products in this loan category:
${criteriaSummary}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1500,
    thinking: { type: "disabled" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const result = textBlock && textBlock.type === "text" ? extractJson(textBlock.text) : null;
  if (!result) {
    throw new Error("Couldn't parse a lender match result from the AI response — try again.");
  }

  return { ...result, ranAt: new Date().toISOString() };
}
