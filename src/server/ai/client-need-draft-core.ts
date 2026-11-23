import Anthropic from "@anthropic-ai/sdk";
import { findLenderMention, replaceLenderInText, stripLenderFromTitle, type LenderRef } from "@/lib/lender-mention";

// The drafting itself, kept apart from the server action so it can be run without a signed-in session.

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

export interface ClientNeedDraftCore {
  itemName: string;
  description: string;
  needType: "document_upload" | "esign" | "questionnaire";
  esignVendor: string | null;
  questions: string[];
  /** The lender this need belongs to, when the request named one. Internal only. */
  lender: LenderRef | null;
}

const SYSTEM_PROMPT = `You help a mortgage processor draft one "client need" checklist item for a borrower-facing document or information request in a loan origination CRM.

Given a short free-text description of what's needed, respond with ONLY a JSON object, no prose outside it, matching this shape exactly:
{"itemName": "short title, e.g. 'Proof of Insurance'", "description": "one or two sentences of instructions for the borrower", "needType": "document_upload" | "questionnaire", "esignVendor": string or null, "questions": ["question 1", "question 2"], "lenderName": string or null}

Rules:
- needType "document_upload": the borrower uploads a file. Use this for the vast majority of requests (bank statements, insurance declarations pages, entity docs, IDs, etc). questions must be [] and esignVendor must be null.
- needType "questionnaire": only when the request is clearly asking the borrower to answer a few specific questions rather than upload or sign anything (e.g. "get their insurance agent's contact info"). Populate "questions" with 2-5 short, specific questions. esignVendor must be null.
- Keep itemName under 6 words. Keep description concise and written for the borrower to read (plain language, no internal jargon).
- lenderName: the request may be followed by a list of the lenders on file. If the request names one of them, including a short form ("Dynamo" for "Dynamo Capital") or its initials, set lenderName to that lender's name exactly as it is written in the list. If it names no lender on the list, use null. Never guess a lender the request does not name.
- The borrower must never learn which lender is funding the loan. NEVER put a lender's name, short form or initials in itemName, description or questions. Name the item for what it is ("Loan Application", "ACH Authorization Agreement") and write "the lender" wherever the instructions need to refer to it.`;

interface ParsedDraft extends Omit<ClientNeedDraftCore, "lender"> {
  lenderName: string | null;
}

export function parseClientNeedDraft(text: string): ParsedDraft | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (
      typeof parsed.itemName === "string" &&
      typeof parsed.description === "string" &&
      ["document_upload", "esign", "questionnaire"].includes(parsed.needType)
    ) {
      return {
        itemName: parsed.itemName,
        description: parsed.description,
        // E-sign isn't offered as a type any more (signing goes through PandaDoc), so a stray "esign" becomes an upload.
        needType: parsed.needType === "esign" ? "document_upload" : parsed.needType,
        esignVendor: typeof parsed.esignVendor === "string" ? parsed.esignVendor : null,
        questions: Array.isArray(parsed.questions)
          ? parsed.questions.filter((q: unknown): q is string => typeof q === "string")
          : [],
        lenderName: typeof parsed.lenderName === "string" && parsed.lenderName.trim() ? parsed.lenderName.trim() : null,
      };
    }
  } catch {
    // fall through to null below
  }
  return null;
}

/**
 * Settles which lender the request is for and makes sure its name stays out of everything the borrower reads.
 * The AI's pick counts only when it is a lender on file; if it names none, the request text is checked directly.
 */
export function resolveDraftLender<T extends LenderRef>(prompt: string, parsed: ParsedDraft, lenders: T[]): { draft: Omit<ClientNeedDraftCore, "lender">; lender: T | null } {
  const picked = parsed.lenderName ? lenders.find((l) => l.name.toLowerCase() === parsed.lenderName!.toLowerCase()) : undefined;
  const lender = picked ?? findLenderMention(prompt, lenders);

  const { lenderName: _lenderName, ...draft } = parsed;
  void _lenderName;
  if (!lender) return { draft, lender: null };

  return {
    draft: {
      ...draft,
      // Falls back to the AI's own title if taking the name out would leave nothing.
      itemName: stripLenderFromTitle(draft.itemName, lender.name) || draft.itemName,
      description: replaceLenderInText(draft.description, lender.name),
      questions: draft.questions.map((q) => replaceLenderInText(q, lender.name)),
    },
    lender,
  };
}

export async function generateClientNeedDraft<T extends LenderRef>(prompt: string, lenders: T[]): Promise<{ draft: Omit<ClientNeedDraftCore, "lender">; lender: T | null }> {
  if (!prompt.trim()) {
    throw new Error("Describe what you need first.");
  }
  if (!anthropic) {
    throw new Error("AI drafting isn't configured (missing ANTHROPIC_API_KEY).");
  }

  const lenderList = lenders.length
    ? `\n\nLenders on file (internal reference only, never shown to the borrower):\n${lenders.map((l) => `- ${l.name}`).join("\n")}`
    : "";

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 600,
    thinking: { type: "disabled" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Request: ${prompt.trim()}${lenderList}` }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const parsed = textBlock && textBlock.type === "text" ? parseClientNeedDraft(textBlock.text) : null;

  if (!parsed) {
    throw new Error("Couldn't parse a draft from the AI response — try rephrasing.");
  }
  return resolveDraftLender(prompt, parsed, lenders);
}
