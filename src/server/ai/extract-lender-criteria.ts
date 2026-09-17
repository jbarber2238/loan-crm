import Anthropic from "@anthropic-ai/sdk";
import { resolveDocContent } from "@/server/lender-documents/resolve-content";

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export interface ExtractedCriteriaTier {
  ficoMin: number | null;
  ficoMax: number | null;
  experienceMin: number | null;
  maxLtc: number | null;
  maxLtarv: number | null;
  maxLtv: number | null;
  notes: string | null;
}

export interface ExtractedCriteria {
  minFico: number | null;
  minLoanAmount: number | null;
  maxLoanAmount: number | null;
  statesAllowed: string[] | null;
  propertyTypesAllowed: string[] | null;
  minDscr: number | null;
  maxLtv: number | null;
  maxLtc: number | null;
  maxLtarv: number | null;
  minExperienceCount: number | null;
  entityOnlyRequired: boolean | null;
  gcLicenseRequired: boolean | null;
  msaPopulationMinimum: number | null;
  tiers: ExtractedCriteriaTier[];
  extractionNotes: string | null;
}

const SYSTEM_PROMPT = `You extract structured underwriting criteria from ONE lender's rate matrix or guideline document, for a mortgage broker's internal database. You are given the document as text or as image(s) of its pages.

Extract these fields where the document states them; use null for anything not stated (never guess a number that isn't actually written down):
- minFico: the single minimum FICO score, ONLY if the matrix isn't tiered by FICO band (if it IS tiered, leave this null and use "tiers" instead).
- minLoanAmount / maxLoanAmount: the program's overall loan amount range, in dollars.
- statesAllowed: array of 2-letter state codes explicitly listed as eligible; null if not restricted or not stated.
- propertyTypesAllowed: array of property type names as the document phrases them (e.g. "Single Family", "2-4 Unit"); null if not restricted or not stated.
- minDscr: minimum DSCR ratio, if this is a DSCR product.
- maxLtv / maxLtc / maxLtarv: overall maximums, ONLY if the matrix isn't tiered (if it IS tiered by FICO/experience, leave these null and use "tiers" instead).
- minExperienceCount: minimum number of prior completed deals/flips/etc. required, if a single flat number (not tiered).
- entityOnlyRequired: true if the document requires the borrower to be an entity (LLC/corp), false if individuals are explicitly fine, null if not addressed.
- gcLicenseRequired: true if a licensed general contractor is required, false if explicitly not required, null if not addressed.
- msaPopulationMinimum: a minimum MSA/metro population threshold, if stated (as a plain number, e.g. 150000).
- tiers: if the matrix has a grid of rows (e.g. FICO band x experience level, each with its own max LTC/LTARV/LTV), one entry per row with whichever of ficoMin/ficoMax/experienceMin/maxLtc/maxLtarv/maxLtv that row states (null for whatever that row doesn't state), plus "notes" for anything about that specific row worth keeping in plain English. Empty array if the matrix isn't tiered.
- extractionNotes: 1-3 sentences of anything important you read that doesn't fit the fields above (unusual overlays, exclusions, special programs) — this is shown to a human reviewer, so be concrete and cite the actual numbers/terms.

CONSISTENCY REQUIREMENT: before writing extractionNotes, check every one of the structured fields above (minFico, minLoanAmount, maxLoanAmount, minDscr, maxLtv, maxLtc, maxLtarv, minExperienceCount, msaPopulationMinimum) — if the document states an overall (non-tiered) value for one of them, that value MUST be set in the structured field itself, not only mentioned in extractionNotes prose. Never describe a concrete overall limit in extractionNotes while leaving its own structured field null.

If the document doesn't contain usable underwriting criteria at all (e.g. it's a servicing guide, a cover page, or genuinely illegible), return every field null/empty and say why in extractionNotes.

Respond with ONLY a JSON object, no prose outside it, matching this shape exactly:
{"minFico":null,"minLoanAmount":null,"maxLoanAmount":null,"statesAllowed":null,"propertyTypesAllowed":null,"minDscr":null,"maxLtv":null,"maxLtc":null,"maxLtarv":null,"minExperienceCount":null,"entityOnlyRequired":null,"gcLicenseRequired":null,"msaPopulationMinimum":null,"tiers":[],"extractionNotes":null}`;

function isNumOrNull(v: unknown): v is number | null {
  return v === null || typeof v === "number";
}
function isBoolOrNull(v: unknown): v is boolean | null {
  return v === null || typeof v === "boolean";
}
function isStrOrNull(v: unknown): v is string | null {
  return v === null || typeof v === "string";
}
function isStrArrayOrNull(v: unknown): v is string[] | null {
  return v === null || (Array.isArray(v) && v.every((x) => typeof x === "string"));
}

function parseTier(t: unknown): ExtractedCriteriaTier | null {
  if (typeof t !== "object" || t === null) return null;
  const r = t as Record<string, unknown>;
  if (
    !isNumOrNull(r.ficoMin) ||
    !isNumOrNull(r.ficoMax) ||
    !isNumOrNull(r.experienceMin) ||
    !isNumOrNull(r.maxLtc) ||
    !isNumOrNull(r.maxLtarv) ||
    !isNumOrNull(r.maxLtv) ||
    !isStrOrNull(r.notes)
  ) {
    return null;
  }
  return {
    ficoMin: r.ficoMin,
    ficoMax: r.ficoMax,
    experienceMin: r.experienceMin,
    maxLtc: r.maxLtc,
    maxLtarv: r.maxLtarv,
    maxLtv: r.maxLtv,
    notes: r.notes,
  };
}

function parseExtraction(text: string): ExtractedCriteria | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const p = JSON.parse(match[0]) as Record<string, unknown>;
    if (
      !isNumOrNull(p.minFico) ||
      !isNumOrNull(p.minLoanAmount) ||
      !isNumOrNull(p.maxLoanAmount) ||
      !isStrArrayOrNull(p.statesAllowed) ||
      !isStrArrayOrNull(p.propertyTypesAllowed) ||
      !isNumOrNull(p.minDscr) ||
      !isNumOrNull(p.maxLtv) ||
      !isNumOrNull(p.maxLtc) ||
      !isNumOrNull(p.maxLtarv) ||
      !isNumOrNull(p.minExperienceCount) ||
      !isBoolOrNull(p.entityOnlyRequired) ||
      !isBoolOrNull(p.gcLicenseRequired) ||
      !isNumOrNull(p.msaPopulationMinimum) ||
      !isStrOrNull(p.extractionNotes) ||
      !Array.isArray(p.tiers)
    ) {
      return null;
    }
    const tiers = p.tiers.map(parseTier);
    if (tiers.some((t) => t === null)) return null;

    return {
      minFico: p.minFico,
      minLoanAmount: p.minLoanAmount,
      maxLoanAmount: p.maxLoanAmount,
      statesAllowed: p.statesAllowed,
      propertyTypesAllowed: p.propertyTypesAllowed,
      minDscr: p.minDscr,
      maxLtv: p.maxLtv,
      maxLtc: p.maxLtc,
      maxLtarv: p.maxLtarv,
      minExperienceCount: p.minExperienceCount,
      entityOnlyRequired: p.entityOnlyRequired,
      gcLicenseRequired: p.gcLicenseRequired,
      msaPopulationMinimum: p.msaPopulationMinimum,
      tiers: tiers as ExtractedCriteriaTier[],
      extractionNotes: p.extractionNotes,
    };
  } catch {
    return null;
  }
}

/**
 * One-time (per document upload) AI pass that turns a lender's raw
 * matrix/guideline document into structured criteria, so future lender-match
 * runs can check a deal against plain stored numbers instead of re-reading
 * and re-reasoning over the same document every single time. Reuses the same
 * document-reading path (text extraction, with a scanned-PDF-to-image
 * fallback) that lender-match itself uses.
 */
export async function extractLenderCriteria(doc: {
  fileName: string;
  mimeType: string;
  data: string;
}): Promise<ExtractedCriteria> {
  if (!anthropic) {
    throw new Error("AI extraction isn't configured (missing ANTHROPIC_API_KEY).");
  }

  const content = await resolveDocContent(doc);
  if (content.kind === "none") {
    return {
      minFico: null,
      minLoanAmount: null,
      maxLoanAmount: null,
      statesAllowed: null,
      propertyTypesAllowed: null,
      minDscr: null,
      maxLtv: null,
      maxLtc: null,
      maxLtarv: null,
      minExperienceCount: null,
      entityOnlyRequired: null,
      gcLicenseRequired: null,
      msaPopulationMinimum: null,
      tiers: [],
      extractionNotes: "Couldn't extract any readable text or images from this document.",
    };
  }

  const blocks: Anthropic.ContentBlockParam[] =
    content.kind === "text"
      ? [{ type: "text", text: content.text }]
      : [{ type: "text", text: `Document "${doc.fileName}":` }, ...content.blocks];

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 2000,
    thinking: { type: "disabled" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: blocks }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const parsed = textBlock && textBlock.type === "text" ? parseExtraction(textBlock.text) : null;
  if (!parsed) {
    return {
      minFico: null,
      minLoanAmount: null,
      maxLoanAmount: null,
      statesAllowed: null,
      propertyTypesAllowed: null,
      minDscr: null,
      maxLtv: null,
      maxLtc: null,
      maxLtarv: null,
      minExperienceCount: null,
      entityOnlyRequired: null,
      gcLicenseRequired: null,
      msaPopulationMinimum: null,
      tiers: [],
      extractionNotes: "Extraction ran but the response couldn't be parsed — needs a manual look or a re-run.",
    };
  }
  return parsed;
}
