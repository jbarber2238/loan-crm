import Anthropic from "@anthropic-ai/sdk";
import { detectImageMediaType } from "@/server/ai/image-media-type";

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]);

export interface ExtractedCondition {
  text: string;
  category: "title" | "insurance" | "borrower" | "other";
  suggestedNeedName: string | null;
  suggestedNeedDescription: string | null;
}

const SYSTEM_PROMPT = `You read a mortgage lender's conditions/stipulations — pasted email text, a conditional approval letter PDF, or both — and split it into individual discrete conditions, then classify each one.

Categories:
- "title": the title company's responsibility (title search/commitment, lien payoffs, recording, survey, etc.) — we're just tracking whether it's cleared.
- "insurance": an insurance requirement (hazard/flood declarations page, proof of coverage, endorsements, etc.) — also just tracked, not something we chase the borrower for directly.
- "borrower": something the borrower themselves must provide or do (bank statements, ID, entity documents, a letter of explanation, updated application info, etc.) — this is the broker's job to go collect from the borrower.
- "other": anything that doesn't clearly fit the three above (internal underwriting stips, appraisal conditions not tied to the borrower, lender-internal items, etc.) — never force something into title/insurance/borrower just to avoid "other".

For every condition you classify as "borrower", also suggest a concise client-need name and one-sentence description, in the same plain, direct style a mortgage processor would use (e.g. name: "Updated Bank Statement (last 2 months)", description: "Most recent 2 months of the borrower's personal bank statements, all pages."). Leave both null for every other category.

Respond with ONLY a JSON object, no prose outside it, in this exact shape:
{"conditions": [{"text": "<the condition as stated, cleaned up but not paraphrased away from its meaning>", "category": "title"|"insurance"|"borrower"|"other", "suggestedNeedName": "<string or null>", "suggestedNeedDescription": "<string or null>"}]}

Rules:
- Lender condition emails are usually numbered or bulleted — treat each numbered/bulleted item as one condition. If it's unstructured prose, use judgment to split it into logical discrete requirements.
- Skip greetings, sign-offs, and pure pleasantries — only extract actual conditions/requirements.
- Don't invent conditions that aren't in the text.`;

function extractJson(text: string): ExtractedCondition[] | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed.conditions)) return null;
    const validCategories = new Set(["title", "insurance", "borrower", "other"]);
    return parsed.conditions
      .filter(
        (c: unknown): c is { text: string; category: string; suggestedNeedName: unknown; suggestedNeedDescription: unknown } =>
          typeof c === "object" &&
          c !== null &&
          typeof (c as Record<string, unknown>).text === "string" &&
          validCategories.has((c as Record<string, unknown>).category as string)
      )
      .map((c: { text: string; category: string; suggestedNeedName: unknown; suggestedNeedDescription: unknown }) => ({
        text: c.text,
        category: c.category as ExtractedCondition["category"],
        suggestedNeedName: typeof c.suggestedNeedName === "string" && c.suggestedNeedName.trim() ? c.suggestedNeedName.trim() : null,
        suggestedNeedDescription:
          typeof c.suggestedNeedDescription === "string" && c.suggestedNeedDescription.trim()
            ? c.suggestedNeedDescription.trim()
            : null,
      }));
  } catch {
    return null;
  }
}

export async function extractConditions({
  emailText,
  file,
}: {
  emailText?: string;
  file?: { fileName: string; mimeType: string; dataBase64: string };
}): Promise<ExtractedCondition[]> {
  if (!anthropic) {
    throw new Error("AI condition extraction isn't configured (missing ANTHROPIC_API_KEY).");
  }

  const contentBlocks: Anthropic.MessageParam["content"] = [];

  if (emailText?.trim()) {
    contentBlocks.push({ type: "text", text: emailText.trim() });
  }

  if (file) {
    const mime = file.mimeType.toLowerCase();
    if (mime === "application/pdf" || file.fileName.toLowerCase().endsWith(".pdf")) {
      contentBlocks.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: file.dataBase64 },
      });
      contentBlocks.push({ type: "text", text: `File name: ${file.fileName}` });
    } else if (SUPPORTED_IMAGE_TYPES.has(mime)) {
      contentBlocks.push({
        type: "image",
        source: { type: "base64", media_type: detectImageMediaType(file.dataBase64, mime), data: file.dataBase64 },
      });
      contentBlocks.push({ type: "text", text: `File name: ${file.fileName}` });
    } else {
      throw new Error(`Can't read "${file.fileName}" — upload a PDF or image instead.`);
    }
  }

  if (!contentBlocks.length) {
    throw new Error("Paste the conditions email text or upload a file first.");
  }

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2000,
    thinking: { type: "disabled" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: contentBlocks }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const result = textBlock && textBlock.type === "text" ? extractJson(textBlock.text) : null;
  if (!result) {
    throw new Error("Couldn't parse conditions from the AI response — try again.");
  }

  return result;
}
