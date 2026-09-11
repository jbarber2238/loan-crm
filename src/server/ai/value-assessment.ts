import Anthropic from "@anthropic-ai/sdk";

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export interface ValueAssessmentResult {
  low: number | null;
  median: number | null;
  high: number | null;
  note: string | null;
  ranAt: string;
}

// A condensed version of Justin's real Comp Analysis (CA) guidelines — the
// actual CA is a much more thorough spreadsheet process done later in the
// deal. This is deliberately a rough directional pass, not a substitute for it.
const SYSTEM_PROMPT = `You are doing a very quick, rough "gut check" on a borrower-proposed property value for a mortgage broker — NOT a full comp analysis or underwriting. The broker has a much more thorough internal comp-analysis process for later in the deal; this is only an early sanity check on whether the borrower's numbers are in a reasonable range.

Use the web_search tool (restricted to zillow.com and redfin.com — realtor.com blocks this tool's crawler) to:
1. Look up the subject property itself for basic facts (square footage, beds/baths, property type, year built) if findable.
2. Find 2-5 comparable recently sold or listed properties near the subject address.

Apply this abbreviated version of the broker's comping methodology as a rough guide — do not show your work, do not attempt precision, this is directional only:
- Prefer comps sold within the last 90 days. Comps 91-180 days old are worth roughly 10% less, and 181-365 days old roughly 20% less, to account for market drift. Comps older than 365 days are not usable — if that's genuinely all you can find, say so in "note" and return null for low/median/high.
- Prefer comps in the same subdivision/immediate area (avoid crossing major roads), similar square footage (roughly ±250 sqft, or ±500 sqft for homes over 2,600 sqft), the same basic property type (e.g. Ranch, 2-Story), and built within roughly ±10 years (looser for pre-1950 homes, since construction didn't change much before then).
- Rough downward adjustments only, never upward for the subject having extra features the neighborhood doesn't generally have: roughly $10,000-$25,000 per bedroom difference, $10,000 per bathroom difference, $10,000 for a pool or garage present/absent, $5,000 for a carport. Adjust down for a busy-road or commercial-adjacent lot.
- Use price-per-square-foot across the comps as a sanity-check benchmark alongside adjusted comp prices.

Respond with ONLY a JSON object, no prose outside it: {"low": <number or null>, "median": <number or null>, "high": <number or null>, "note": "<string or null>"}

Rules:
- low/median/high are YOUR estimated realistic value range for the subject property in whole dollars, based on the comps you found — not a restatement of the borrower's claimed value.
- If you cannot find enough usable comp data to form any reasonable estimate, set low/median/high to null and explain why in "note" (e.g. "no comps sold within the required 12-month window").
- Keep "note" to one short sentence — a caveat about data quality or comp count, not a write-up. Set it to null if there's nothing worth flagging.
- This is a rough directional estimate only — never claim certainty, never mention "underwriting" or "final approval".`;

function extractJson(text: string): Omit<ValueAssessmentResult, "ranAt"> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
    return {
      low: num(parsed.low),
      median: num(parsed.median),
      high: num(parsed.high),
      note: typeof parsed.note === "string" && parsed.note.trim() ? parsed.note.trim() : null,
    };
  } catch {
    return null;
  }
}

export async function runValueAssessment({
  propertyAddress,
  loanCategory,
  propertyType,
  unitCount,
  purchasePrice,
  estimatedAsIsValue,
  estimatedArv,
}: {
  propertyAddress: string;
  loanCategory: string;
  propertyType: string | null;
  unitCount: number | null;
  purchasePrice: number | null;
  estimatedAsIsValue: number | null;
  estimatedArv: number | null;
}): Promise<ValueAssessmentResult> {
  if (!anthropic) {
    throw new Error("AI value assessment isn't configured (missing ANTHROPIC_API_KEY).");
  }

  const dealSummaryLines = [
    `Subject property address: ${propertyAddress}`,
    `Loan category: ${loanCategory}`,
    propertyType ? `Property type: ${propertyType}` : null,
    unitCount ? `Unit count: ${unitCount}` : null,
    purchasePrice ? `Borrower's purchase price: $${purchasePrice.toLocaleString()}` : null,
    estimatedAsIsValue ? `Borrower's estimated as-is value: $${estimatedAsIsValue.toLocaleString()}` : null,
    estimatedArv
      ? `Borrower's estimated ARV (after repair/construction value): $${estimatedArv.toLocaleString()}`
      : null,
  ].filter((l): l is string => l !== null);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2000,
    thinking: { type: "disabled" },
    system: SYSTEM_PROMPT,
    tools: [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 6,
        // realtor.com's robots.txt blocks Anthropic's web-search crawler outright
        // (a 400 "not accessible to our user agent" error) — it can never work here.
        allowed_domains: ["zillow.com", "redfin.com"],
      },
    ],
    messages: [{ role: "user", content: dealSummaryLines.join("\n") }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  const result = extractJson(text);
  if (!result) {
    throw new Error("Couldn't parse a value assessment from the AI response — try again.");
  }

  return { ...result, ranAt: new Date().toISOString() };
}
