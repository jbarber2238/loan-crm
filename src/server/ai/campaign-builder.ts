import Anthropic from "@anthropic-ai/sdk";
import { applyDraftUpdate, buttonListForPrompt, type CampaignDraft, type ChatMessage } from "@/lib/campaign-draft";
import { describeSchedule } from "@/lib/campaign-schedule";
import { CAMPAIGN_MERGE_FIELDS, FUNNELS } from "@/lib/campaign-email";
import { etParts } from "@/lib/friday-schedule";
import type { AudienceOption } from "@/lib/marketing-audience";

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

const MAX_TAG_OPTIONS_IN_PROMPT = 60;

const UPDATE_TOOL: Anthropic.Tool = {
  name: "update_campaign",
  description:
    "Set up or change the campaign on the page in front of the user. Include only the fields you are changing. The page shows the result immediately for them to review; nothing is sent until they press Start.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Short internal campaign name, under 8 words" },
      subject: { type: "string", description: "Email subject line" },
      body: { type: "string", description: "The full email body as plain text with blank lines between paragraphs. Use {{firstName}} and button tokens, each button token alone on its own line. No sign-off name: the signature is added automatically." },
      audience_key: { type: "string", description: "Exactly one key from the audience list" },
      funnel: { type: "string", enum: [...FUNNELS.map((f) => f.value), "none"], description: "The funnel or campaign this email belongs to" },
      tag_recipients: { type: "string", description: "A tag to put on everyone who receives it, e.g. 'campaign: oct webinar'. Leave out to use the automatic one." },
      skip_previous_recipients: { type: "boolean", description: "True: never send this email to someone who already got it (right for repeating campaigns aimed at newcomers). False: send to everyone on every run." },
      schedule: {
        type: "object",
        description: "When it goes out. All times are Eastern.",
        properties: {
          mode: { type: "string", enum: ["draft", "now", "once", "repeat"] },
          date: { type: "string", description: "YYYY-MM-DD, for mode once" },
          time: { type: "string", description: "24-hour HH:MM Eastern, e.g. 09:00" },
          repeat_every: { type: "string", enum: ["week", "two_weeks", "month"] },
          weekday: { type: "string", enum: ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"], description: "For weekly and every-two-weeks repeats" },
          day_of_month: { type: "integer", minimum: 1, maximum: 28, description: "For monthly repeats" },
          start_date: { type: "string", description: "YYYY-MM-DD the repeat begins" },
          end_date: { type: "string", description: "YYYY-MM-DD the repeat stops, if the user gave one" },
          max_runs: { type: "integer", description: "Stop after this many sends, if the user gave a limit" },
        },
        required: ["mode"],
      },
    },
  },
};

function systemPrompt(draft: CampaignDraft, audiences: AudienceOption[], now: Date): string {
  const p = etParts(now);
  const today = `${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][p.weekday]}, ${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  const builtIn = audiences.filter((a) => a.group !== "By tag");
  const tags = audiences.filter((a) => a.group === "By tag").slice(0, MAX_TAG_OPTIONS_IN_PROMPT);
  const line = (a: AudienceOption) => `- ${a.key} — ${a.label} (${a.eligible} can be emailed${a.notAgreed ? `, ${a.notAgreed} more haven't agreed to marketing` : ""})`;
  return `You are the marketing email assistant inside the loan CRM of Justin Barber, a private-money and DSCR lender (Manna Lending, mannalendingco.com: DSCR loans, fix-and-flip, bridge, new construction). Justin describes a campaign by typing or speaking; you talk it through with him, then build it on the page in front of him with the update_campaign tool. He reviews it and presses Start himself, so never say anything has been sent.

Today is ${today} (Eastern time).

How to work:
- Be brief and warm. Ask at most two short questions at a time, and only for what you truly need: who it is for, what the email should get them to do, and when it should go out. If he has already given enough, don't ask: build it.
- As soon as you have enough to make a reasonable first version, call update_campaign with everything you can fill in (name, subject, body, audience, schedule, linked funnel), Write your text reply first, as a few plain sentences saying what you're setting up and what you assumed (who it goes to, when, what the email asks them to do) so he can correct it, then call the tool. Always include that text reply, never just the tool call.
- When he asks for a change, call update_campaign with only what changes.
- Never invent audiences, buttons, merge fields or funnels. Use only those listed below.
- Write like Justin: plain, direct and personal, short paragraphs, no hype, no emoji, no corporate filler. Don't promise rates, approvals or results, and don't state any numbers he hasn't given you. Do not sign off with a name: his signature is added automatically.
- Put each button token alone on its own line.
- Only say things about the reader that the audience itself guarantees. "Friday Zoom: everyone who registered" does not mean they attended; "Borrowers who submitted but haven't closed" are not customers yet. When unsure, write something that is true for everyone on the list.
- Talk to Justin in plain words: say the audience's name (e.g. "Friday Zoom: not partners yet"), never its key.

Facts you may use (nothing else about the business is known to you, so don't invent details, prices or results):
- The Friday Zoom is "See It, Send It, Get Paid": a free 30-minute lunch Zoom, every Friday at 12:00 PM Eastern, for people who might refer deals. It shows how to spot fundable investor deals and get paid for the introduction. The {{fridayButton}} sends people to the page where they save a seat.
- Manna Lending lends on DSCR rental loans, fix-and-flip, bridge and new construction. Partners earn a referral fee when a deal they send closes.

Merge fields (written {{name}}):
${CAMPAIGN_MERGE_FIELDS.map((f) => `- {{${f.key}}}: ${f.description}`).join("\n")}

Buttons (each alone on its own line in the body):
${buttonListForPrompt()}

Funnels/campaigns an email can be linked to (links the CTA button, tags everyone who gets it, and counts clicks): ${FUNNELS.map((f) => `${f.value} (${f.label})`).join(", ")}, or none.

Audiences (use the key before the dash). Counts are people who agreed to marketing and haven't unsubscribed. Only those can ever be emailed.
${builtIn.map(line).join("\n")}
Tag audiences:
${tags.map(line).join("\n") || "- none yet"}

Scheduling: one email per campaign. It can send right away, once at a date and time, or repeat weekly, every two weeks or monthly (optionally with an end date or a maximum number of sends). For a repeat aimed at people as they arrive, set skip_previous_recipients to true so nobody gets it twice.

What this builder cannot do (say so plainly when he asks, still set up everything else you can): build new web pages or forms; start an automatic multi-email drip sequence (each email would be its own campaign); text messages; count opens (clicks on buttons are counted); enrol people into the Friday Zoom itself (the button sends them to the registration page; registrations still follow the existing Friday flow). Those need to be built separately in Claude Code.

The campaign on the page right now:
- Name: ${draft.name || "(empty)"}
- Subject: ${draft.subject || "(empty)"}
- Audience: ${draft.audienceKey}
- Linked funnel: ${draft.funnel ?? "none"}
- Schedule: ${describeSchedule(draft.schedule)}
- Email body:
${draft.body || "(empty)"}`;
}

export interface ChatTurn {
  reply: string;
  draft: CampaignDraft;
  changes: string[];
}

export async function runCampaignChat(history: ChatMessage[], draft: CampaignDraft, audiences: AudienceOption[], now = new Date()): Promise<ChatTurn> {
  if (!anthropic) throw new Error("AI isn't configured (missing ANTHROPIC_API_KEY).");
  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 3000,
    thinking: { type: "disabled" },
    system: systemPrompt(draft, audiences, now),
    tools: [UPDATE_TOOL],
    messages: history.slice(-20).map((m) => ({ role: m.role, content: m.content })),
  });

  const labels = new Map(audiences.map((a) => [a.key, a.label]));
  let next = draft;
  const changes: string[] = [];
  const problems: string[] = [];
  for (const block of response.content) {
    if (block.type !== "tool_use" || block.name !== UPDATE_TOOL.name) continue;
    const result = applyDraftUpdate(next, block.input, labels, now);
    next = result.draft;
    changes.push(...result.changes);
    problems.push(...result.problems);
  }
  let reply = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join("\n\n");
  if (!reply) reply = changes.length ? "I've set that up on the page. Take a look and tell me what to change." : "Tell me a bit more about the campaign you have in mind.";
  if (problems.length) reply += `\n\n${problems.join(" ")}`;
  return { reply, draft: next, changes };
}
