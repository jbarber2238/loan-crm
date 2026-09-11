"use server";

import Anthropic from "@anthropic-ai/sdk";
import { requireAdmin } from "@/server/auth/guards";
import { extractDocumentText } from "@/server/lender-documents/extract-text";
import { detectImageMediaType } from "@/server/ai/image-media-type";
import { LOAN_CATEGORIES } from "@/lib/labels";

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]);

export type LoanCategory = (typeof LOAN_CATEGORIES)[number]["value"];

export interface LenderDocumentClassification {
  categories: LoanCategory[];
  confidence: "high" | "low";
}

const CATEGORY_LIST = LOAN_CATEGORIES.map((c) => `- ${c.value}: ${c.label}`).join("\n");
const VALID_CATEGORIES = new Set<string>(LOAN_CATEGORIES.map((c) => c.value));

const SYSTEM_PROMPT = `You classify a mortgage lender's rate matrix or guideline document into one or more of a broker's fixed loan program categories, so it can be filed under the right product automatically.

Categories:
${CATEGORY_LIST}

Respond with ONLY a JSON object, no prose outside it: {"categories": ["<value>", ...], "confidence": "high" | "low"}

Rules:
- List every category value this document's rates or guidelines actually cover. Most matrices cover exactly one category — only list more than one if the document clearly contains separate, distinct sections or rate sheets for multiple distinct programs.
- Use "high" confidence when the document's title, headers, or content make its program type clear and unambiguous.
- Use "low" confidence when you're guessing, when the document is generic (a cover letter, company overview, a form not tied to one specific program), or when you genuinely can't tell.
- If you can't tell at all, return an empty categories array with "low" confidence — never guess a category with no real basis.
- Only use category values from the list above, spelled exactly as shown.`;

function extractJson(text: string): LenderDocumentClassification | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed.categories) && (parsed.confidence === "high" || parsed.confidence === "low")) {
      return {
        categories: parsed.categories.filter(
          (c: unknown): c is LoanCategory => typeof c === "string" && VALID_CATEGORIES.has(c)
        ),
        confidence: parsed.confidence,
      };
    }
  } catch {
    // fall through to null below
  }
  return null;
}

export async function classifyLenderDocument({
  fileName,
  mimeType,
  dataBase64,
}: {
  fileName: string;
  mimeType: string;
  dataBase64: string;
}): Promise<LenderDocumentClassification> {
  await requireAdmin();

  if (!anthropic) {
    return { categories: [], confidence: "low" };
  }

  const mime = mimeType.toLowerCase();
  const contentBlocks: Anthropic.MessageParam["content"] = [];

  if (mime === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
    contentBlocks.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: dataBase64 },
    });
  } else if (SUPPORTED_IMAGE_TYPES.has(mime)) {
    contentBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: detectImageMediaType(dataBase64, mime),
        data: dataBase64,
      },
    });
  } else {
    const text = await extractDocumentText(fileName, mimeType, dataBase64);
    if (!text) {
      // Can't read this file type at all (e.g. .docx) — no basis to classify.
      return { categories: [], confidence: "low" };
    }
    contentBlocks.push({ type: "text", text });
  }

  contentBlocks.push({ type: "text", text: `File name: ${fileName}` });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 300,
    thinking: { type: "disabled" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: contentBlocks }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const result = textBlock && textBlock.type === "text" ? extractJson(textBlock.text) : null;

  return result ?? { categories: [], confidence: "low" };
}
