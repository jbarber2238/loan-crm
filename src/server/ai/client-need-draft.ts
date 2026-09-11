"use server";

import Anthropic from "@anthropic-ai/sdk";
import { requireAdmin } from "@/server/auth/guards";

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export interface ClientNeedDraft {
  itemName: string;
  description: string;
  needType: "document_upload" | "esign" | "questionnaire";
  esignVendor: string | null;
  questions: string[];
}

const SYSTEM_PROMPT = `You help a mortgage processor draft one "client need" checklist item for a borrower-facing document or information request in a loan origination CRM.

Given a short free-text description of what's needed, respond with ONLY a JSON object, no prose outside it, matching this shape exactly:
{"itemName": "short title, e.g. 'Proof of Insurance'", "description": "one or two sentences of instructions for the borrower", "needType": "document_upload" | "esign" | "questionnaire", "esignVendor": string or null, "questions": ["question 1", "question 2"]}

Rules:
- needType "document_upload": the borrower uploads a file. Use this for the vast majority of requests (bank statements, insurance declarations pages, entity docs, IDs, etc). questions must be [] and esignVendor must be null.
- needType "esign": only when the request explicitly says the borrower needs to sign something via an e-sign vendor (PandaDoc, DocuSign, etc). Set esignVendor if a specific vendor is named, otherwise null. questions must be [].
- needType "questionnaire": only when the request is clearly asking the borrower to answer a few specific questions rather than upload or sign anything (e.g. "get their insurance agent's contact info"). Populate "questions" with 2-5 short, specific questions. esignVendor must be null.
- Keep itemName under 6 words. Keep description concise and written for the borrower to read (plain language, no internal jargon).`;

function extractJson(text: string): ClientNeedDraft | null {
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
        needType: parsed.needType,
        esignVendor: typeof parsed.esignVendor === "string" ? parsed.esignVendor : null,
        questions: Array.isArray(parsed.questions)
          ? parsed.questions.filter((q: unknown): q is string => typeof q === "string")
          : [],
      };
    }
  } catch {
    // fall through to null below
  }
  return null;
}

export async function draftClientNeedWithAI(prompt: string): Promise<ClientNeedDraft> {
  await requireAdmin();

  if (!prompt.trim()) {
    throw new Error("Describe what you need first.");
  }
  if (!anthropic) {
    throw new Error("AI drafting isn't configured (missing ANTHROPIC_API_KEY).");
  }

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 500,
    thinking: { type: "disabled" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt.trim() }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const draft = textBlock && textBlock.type === "text" ? extractJson(textBlock.text) : null;

  if (!draft) {
    throw new Error("Couldn't parse a draft from the AI response — try rephrasing.");
  }
  return draft;
}
