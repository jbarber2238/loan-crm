import { and, eq, isNull } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/server/db/client";
import { lenderDocuments, products } from "@/server/db/schema";
import { type DocContent, headerNoteFor, resolveDocContent } from "@/server/lender-documents/resolve-content";
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

const SYSTEM_PROMPT = `You are helping a mortgage broker quickly shop a deal to their own lenders. You are given one deal's numbers and every one of the broker's ACTIVE lender products in this deal's specific loan category (each with its own criteria notes and/or excerpts — as text, or as attached images of the actual rate matrix/guideline pages — from the lender's rate matrix or guideline documents).

Some criteria are given to you as images rather than text — either a photo/screenshot of a lender's rate sheet, or page images rendered from a scanned PDF guideline document — read those directly the same as you would a text excerpt; a heading right before a set of images tells you which lender/product (and whether it's a lender-wide or product-specific document) they belong to.

For every product listed, judge it as one of:
- "strong": clearly qualifies against the criteria/documents provided.
- "close": borderline on at least one criterion — say exactly which one and how close.
- "poor": clearly disqualified by a criterion the deal's own numbers/fields affirmatively fail — say why.

Only use "poor" when the deal data actually violates a stated criterion. A criterion you simply have no way to check — because it isn't one of the deal fields you were given at all (e.g. GC licensing status, a subjective "market stability" designation) — is never grounds for "poor" by itself; that's a "close" (or "strong" if every checkable criterion clearly passes), with the unconfirmed item named plainly in "reason" as something to verify, not treated as a failure. Reserve "poor" for a number or fact you were actually given that falls outside the lender's stated range.

The deal's "Borrower entity" field tells you whether this loan is closing in an entity's name — if it names a real entity (not "not provided"), a lender's "Entity Only" / "U.S. Legal Entity borrower" requirement is satisfied; don't flag it as unconfirmed just because the borrower's personal name is also shown. Only flag entity type as a genuine open item when that field says "not provided."

If a product has no criteria or documents on file, or the excerpt/image doesn't cover something you'd need to judge, say so plainly in "reason" rather than guessing a fit level you can't support.

On a New Construction / ground-up-construction deal, a lender's "ineligible property: land" (or "raw land") note refers to a speculative land-only loan with no construction — it does NOT disqualify a construction loan just because the deal includes acquiring the lot, since every ground-up construction loan by definition starts with land. Don't flag land ineligibility against a New Construction deal for that reason alone.

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

  // A lender-wide doc is shared across every one of that lender's products in
  // this category — resolve it once per lender, not once per product, so a
  // lender with three products here doesn't triple the same matrix (tripling
  // cost for images especially) in the prompt. Resolved up front, in a plain
  // sequential pass, rather than by mutating shared state from inside the
  // concurrent Promise.all below — that would depend on exactly when each
  // product's async work happens to interleave, which is fragile to reason
  // about and easy to break with an unrelated future change.
  const lenderWideContent = new Map<string, { doc: (typeof activeProducts)[number]["lender"]["documents"][number]; content: DocContent } | null>();
  const firstProductIdForLender = new Map<string, string>();

  // Which lender-wide doc belongs to each lender is a plain synchronous
  // lookup — resolving what's actually IN that doc (extraction, or
  // rendering a scanned PDF's pages) is the slow, async part, and different
  // lenders' docs are fully independent of each other, so that resolution
  // runs concurrently across lenders. Safe to parallelize (unlike the
  // per-product pass below) because each task here owns a distinct lenderId
  // key — nothing is racing to decide who writes the same key.
  const uniqueLenderWideDocs = new Map<string, (typeof activeProducts)[number]["lender"]["documents"][number] | null>();
  for (const p of activeProducts) {
    if (!firstProductIdForLender.has(p.lenderId)) firstProductIdForLender.set(p.lenderId, p.id);
    if (uniqueLenderWideDocs.has(p.lenderId)) continue;
    const lenderWideDoc = p.lender.documents
      .filter((d) => d.productId === null)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    uniqueLenderWideDocs.set(p.lenderId, lenderWideDoc ?? null);
  }

  await Promise.all(
    Array.from(uniqueLenderWideDocs.entries()).map(async ([lenderId, doc]) => {
      if (!doc) {
        lenderWideContent.set(lenderId, null);
        return;
      }
      const content = await resolveDocContent(doc);
      lenderWideContent.set(lenderId, { doc, content });
    })
  );

  const productBlockGroups = await Promise.all(
    activeProducts.map(async (p) => {
      const c = p.criteria;
      const productDoc = p.documents[0];

      const blocks: Anthropic.ContentBlockParam[] = [];
      const headerParts: string[] = [];

      if (c?.otherNotes) headerParts.push(`notes: ${c.otherNotes}`);

      const lenderWide = lenderWideContent.get(p.lenderId);
      let attachLenderWideImages = false;
      if (lenderWide) {
        const isFirstForLender = firstProductIdForLender.get(p.lenderId) === p.id;
        if (lenderWide.content.kind === "images") {
          if (isFirstForLender) {
            attachLenderWideImages = true;
            headerParts.push(headerNoteFor(lenderWide.content, lenderWide.doc.fileName, `lender-wide matrix (applies to every ${p.lender.name} product in this category)`)!);
          } else {
            headerParts.push(`(see this lender's rate matrix already shown above)`);
          }
        } else {
          const note = headerNoteFor(lenderWide.content, lenderWide.doc.fileName, "lender rate matrix");
          if (note) headerParts.push(note);
        }
      }

      let productDocContent: DocContent | null = null;
      if (productDoc) {
        productDocContent = await resolveDocContent(productDoc);
        const note = headerNoteFor(productDocContent, productDoc.fileName, "product document");
        if (note) headerParts.push(note);
      }

      blocks.push({
        type: "text",
        text: `- ${p.lender.name} / ${p.name} (${labelFor(LOAN_CATEGORIES, p.category)}): ${
          headerParts.join("\n  ") || "no criteria or documents on file"
        }`,
      });

      if (attachLenderWideImages && lenderWide?.content.kind === "images") blocks.push(...lenderWide.content.blocks);
      if (productDocContent?.kind === "images") blocks.push(...productDocContent.blocks);

      return blocks;
    })
  );

  const masterDoc = masterDocs[0];
  const masterDocBlocks: Anthropic.ContentBlockParam[] = [];
  if (masterDoc) {
    const content = await resolveDocContent(masterDoc);
    const label = "Master lender matrix (covers every lender/product at a glance — cross-check against the lender-specific details below)";
    if (content.kind === "text") {
      masterDocBlocks.push({ type: "text", text: `${label}:\n${content.text}` });
    } else if (content.kind === "images") {
      masterDocBlocks.push({ type: "text", text: `${label}:` }, ...content.blocks);
    }
  }

  const content: Anthropic.ContentBlockParam[] = [
    { type: "text", text: buildDealSummaryForAi(deal) },
    ...masterDocBlocks,
    { type: "text", text: "Active lender products in this loan category:" },
    ...productBlockGroups.flat(),
  ];

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    // Comfortably above the ~1300 tokens a real multi-lender response
    // actually uses — a run that reasons a bit longer than usual was
    // getting cut off mid-JSON at the old 1500 cap, which silently broke
    // parsing (observed directly: one run used 1328/1500).
    max_tokens: 4000,
    thinking: { type: "disabled" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const result = textBlock && textBlock.type === "text" ? extractJson(textBlock.text) : null;
  if (!result) {
    throw new Error("Couldn't parse a lender match result from the AI response — try again.");
  }

  return { ...result, ranAt: new Date().toISOString() };
}
