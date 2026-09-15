"use server";

import Anthropic from "@anthropic-ai/sdk";
import { requireAdmin } from "@/server/auth/guards";
import { tokensForCategory, type EmailTemplateCategory } from "@/lib/email-template-tokens";
import { STAGES } from "@/lib/labels";

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export interface EmailTemplateDraft {
  name: string;
  subject: string;
  body: string;
  triggerStage: string | null;
}

const AUDIENCE_BY_CATEGORY: Record<EmailTemplateCategory, string> = {
  pricing_request: "a lender's pricing rep, requesting terms on a deal",
  borrower_lifecycle: "the borrower on a loan file",
  insurance_request: "an insurance agent, requesting a binder for a property",
  title_request: "a title agent, requesting title work be opened on a property",
  application_submission: "a lender's rep, submitting a loan application for processing",
};

function systemPromptFor(category: EmailTemplateCategory): string {
  const tokens = tokensForCategory(category)
    .map((t) => `- {{${t.key}}} — ${t.description}`)
    .join("\n");

  const audience = AUDIENCE_BY_CATEGORY[category];

  const stageGuidance =
    category === "borrower_lifecycle"
      ? `\n\nAlso suggest which pipeline stage this email would naturally go out at, if any. Valid stages: ${STAGES.map((s) => s.value).join(", ")}. If the prompt doesn't clearly imply a stage, set "triggerStage" to null — don't guess.`
      : `\n\nThis template's send trigger isn't stage-based (pricing requests go out when a rep manually prices a deal), so always set "triggerStage" to null.`;

  return `You help a mortgage processor draft an email template for a loan origination CRM. This particular template is sent to ${audience}.

Respond with ONLY a JSON object, no prose outside it, in this exact shape:
{"name": "short internal template name", "subject": "email subject line", "body": "full email body", "triggerStage": "<one of the stage values>" or null}

Available merge fields for this template — use "{{fieldKey}}" (double curly braces) inline in the subject/body wherever a real value from the deal should appear instead of a hardcoded placeholder:
${tokens}

Rules:
- Only use merge fields from the list above, spelled exactly as shown. Never invent a field name that isn't listed.
- Pick whichever fields actually make the email useful and specific — this is the core job: figure out which real data points belong in this email given what the user asked for, and reference them with the right merge fields instead of writing generic filler text.
- Write the body as complete, ready-to-send prose (greeting, message, sign-off) — not a fragment or an outline.
- Keep "name" short (under 8 words) — it's an internal label, not shown to the recipient.${stageGuidance}`;
}

function extractJson(text: string): EmailTemplateDraft | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (typeof parsed.name === "string" && typeof parsed.subject === "string" && typeof parsed.body === "string") {
      const validStage = STAGES.some((s) => s.value === parsed.triggerStage);
      return {
        name: parsed.name,
        subject: parsed.subject,
        body: parsed.body,
        triggerStage: validStage ? parsed.triggerStage : null,
      };
    }
  } catch {
    // fall through to null below
  }
  return null;
}

export async function draftEmailTemplateWithAI(
  prompt: string,
  category: EmailTemplateCategory
): Promise<EmailTemplateDraft> {
  await requireAdmin();

  if (!prompt.trim()) {
    throw new Error("Describe what this email should say first.");
  }
  if (!anthropic) {
    throw new Error("AI drafting isn't configured (missing ANTHROPIC_API_KEY).");
  }

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1200,
    thinking: { type: "disabled" },
    system: systemPromptFor(category),
    messages: [{ role: "user", content: prompt.trim() }],
  });

  const textBlock = response.content.find((block) => block.type === "text");
  const draft = textBlock && textBlock.type === "text" ? extractJson(textBlock.text) : null;

  if (!draft) {
    throw new Error("Couldn't parse a draft from the AI response — try rephrasing.");
  }
  return draft;
}
