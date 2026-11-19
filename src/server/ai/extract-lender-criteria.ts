import Anthropic from "@anthropic-ai/sdk";
import { resolveExtractionBlocks } from "@/server/lender-documents/resolve-content";
import { LOAN_CATEGORIES } from "@/lib/labels";

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
  foreignNationalEligible: boolean | null;
  itinEligible: boolean | null;
  ruralEligible: boolean | null;
  tiers: ExtractedCriteriaTier[];
  extractionNotes: string | null;
  detectedCategory: string | null;
}

const CATEGORY_VALUES: string[] = LOAN_CATEGORIES.map((c) => c.value);

// The field-by-field instructions are shared by the single-program and multi-program prompts.
const FIELD_GUIDE = `Extract these fields where the document states them; use null for anything not stated (never guess a number that isn't actually written down):
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
- foreignNationalEligible: true if the document explicitly says foreign nationals are eligible borrowers, false if explicitly excluded/not eligible, null if not addressed at all.
- itinEligible: true if the document explicitly says ITIN borrowers (no SSN, tax ID only) are eligible, false if explicitly excluded, null if not addressed at all.
- ruralEligible: true if the document explicitly says rural properties are eligible, false if rural properties are explicitly excluded/ineligible, null if not addressed at all.
- tiers: if the matrix has a grid of rows (e.g. FICO band x experience level, each with its own max LTC/LTARV/LTV), one entry per row with whichever of ficoMin/ficoMax/experienceMin/maxLtc/maxLtarv/maxLtv that row states (null for whatever that row doesn't state), plus "notes" for anything about that specific row worth keeping in plain English. Empty array if the matrix isn't tiered.
- extractionNotes: 1-3 sentences of anything important you read that doesn't fit the fields above (unusual overlays, exclusions, special programs) — this is shown to a human reviewer, so be concrete and cite the actual numbers/terms.`;

const TABLE_RULE = `COMPLETENESS AND TABLE ACCURACY: a loan officer will make go/no-go decisions from these numbers, so a missing or misplaced row is worse than a blank. For every grid, list EVERY row (each combination of FICO band, experience level, rehab level, property class or loan purpose the document gives a number for) as its own tier; never skip, average or merge rows. Read each value from the cell under its own column header and on its own row label, not from the order the text happens to come out in. Before answering, count the rows in each source table and make sure your tiers match. Put the row's full context in its "notes" (e.g. "Single-family, Moderate Rehab, 5-10 flips"). Also record, in extractionNotes, every other decision-relevant fact that has no field above: maximum loan amounts, loan term and amortization options, prepayment penalty options, leverage for refinance and cash-out when the grid only covers purchase, minimum property value, and special conditions or footnotes attached to a number.`;

const CONSISTENCY_RULE = `CONSISTENCY REQUIREMENT: before writing extractionNotes, check every one of the structured fields above (minFico, minLoanAmount, maxLoanAmount, minDscr, maxLtv, maxLtc, maxLtarv, minExperienceCount, msaPopulationMinimum) — if the document states an overall (non-tiered) value for one of them, that value MUST be set in the structured field itself, not only mentioned in extractionNotes prose. Never describe a concrete overall limit in extractionNotes while leaving its own structured field null.`;

const SYSTEM_PROMPT = `You extract structured underwriting criteria from ONE lender's rate matrix or guideline document, for a mortgage broker's internal database. You are given the document as text or as image(s) of its pages.

${FIELD_GUIDE}
- detectedCategory: which ONE loan program this document's matrix/guideline is for, chosen from EXACTLY this list of values: ${CATEGORY_VALUES.join(", ")}. Use null if the document isn't clearly about a single one of these programs (e.g. it's a general company overview, a multi-program summary, or genuinely ambiguous) — never guess.

${CONSISTENCY_RULE}

${TABLE_RULE}

If the document doesn't contain usable underwriting criteria at all (e.g. it's a servicing guide, a cover page, or genuinely illegible), return every field null/empty and say why in extractionNotes.

Respond with ONLY a JSON object, no prose outside it, matching this shape exactly:
{"minFico":null,"minLoanAmount":null,"maxLoanAmount":null,"statesAllowed":null,"propertyTypesAllowed":null,"minDscr":null,"maxLtv":null,"maxLtc":null,"maxLtarv":null,"minExperienceCount":null,"entityOnlyRequired":null,"gcLicenseRequired":null,"msaPopulationMinimum":null,"foreignNationalEligible":null,"itinEligible":null,"ruralEligible":null,"tiers":[],"extractionNotes":null,"detectedCategory":null}`;

// For a lender's "complete package" or multi-program matrix: one pass that reads the whole document and returns a
// separate set of criteria for every loan program in it, so each can be filed under its own product.
const PROGRAMS_SYSTEM_PROMPT = `You extract structured underwriting criteria from ONE lender's rate matrix, guideline sheet or marketing package, for a mortgage broker's internal database. The document may cover ONE loan program or SEVERAL (for example fix-and-flip, new construction, bridge and long-term rental programs in the same package). You are given the whole document as text or as image(s) of its pages; read all of it.

Return one entry in "programs" for each loan program the document gives criteria for. Tag each entry with "detectedCategory", chosen from EXACTLY this list of values: ${CATEGORY_VALUES.join(", ")}.
- Map the document's own program names onto that list: fix and flip / rehab → fix_and_flip; new construction / ground-up → new_construction; bridge / stabilized bridge → bridge_purchase and bridge_refinance; long-term rental / DSCR / rental → dscr_purchase, dscr_rate_term_refinance and dscr_cash_out_refinance.
- When the document gives separate purchase, refinance and cash-out numbers for a program, make a separate entry for each matching category using that scenario's own numbers. When it gives one set of numbers that apply to both purchase and refinance, repeat the entry for each of those categories.
- Exactly ONE entry per category. When a category appears in more than one sub-program (for example a 1-4 unit program and a 5+ unit program), merge them into one entry: use the widest loan amount range, list the property types of both, put every sub-program's grid rows in "tiers" with the sub-program named in that row's "notes" (e.g. "Single-family 1-4 units: ..." or "Multi-family 5+ units: ..."), and say in extractionNotes how the sub-programs differ (minimum loan amount, minimum property value, term and so on).
- A program that doesn't fit any category in the list is left out; mention it in "general.extractionNotes".
- If the document has no usable underwriting criteria at all (a servicing guide, a cover page, illegible), return "programs": [] and say why in "general.extractionNotes".

Each entry in "programs" has these fields:

${FIELD_GUIDE}
- detectedCategory: the category for this entry (see above); never null in this list.

${CONSISTENCY_RULE}

${TABLE_RULE} For a program entry, extractionNotes may run to 6-8 sentences to hold all of that.

"general" holds facts that apply to the lender as a whole rather than one program: foreignNationalEligible, itinEligible and ruralEligible (same meaning as above, null when not addressed) and extractionNotes (1-3 sentences on anything important that isn't captured in the programs, including programs you left out).

Respond with ONLY a JSON object, no prose outside it, matching this shape exactly:
{"programs":[{"minFico":null,"minLoanAmount":null,"maxLoanAmount":null,"statesAllowed":null,"propertyTypesAllowed":null,"minDscr":null,"maxLtv":null,"maxLtc":null,"maxLtarv":null,"minExperienceCount":null,"entityOnlyRequired":null,"gcLicenseRequired":null,"msaPopulationMinimum":null,"foreignNationalEligible":null,"itinEligible":null,"ruralEligible":null,"tiers":[],"extractionNotes":null,"detectedCategory":"fix_and_flip"}],"general":{"foreignNationalEligible":null,"itinEligible":null,"ruralEligible":null,"extractionNotes":null}}`;

// The one-time extraction reads far more of a document than the per-deal lender match does (which re-reads on every
// run and so stays small): the whole of a typical lender package, text or page images.
const EXTRACTION_LIMITS = { maxChars: 60000, maxScannedPages: 12 };

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

function parseExtractionObject(p: Record<string, unknown>): ExtractedCriteria | null {
  {
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
      !isBoolOrNull(p.foreignNationalEligible) ||
      !isBoolOrNull(p.itinEligible) ||
      !isBoolOrNull(p.ruralEligible) ||
      !isStrOrNull(p.extractionNotes) ||
      !Array.isArray(p.tiers) ||
      !isStrOrNull(p.detectedCategory)
    ) {
      return null;
    }
    const tiers = p.tiers.map(parseTier);
    if (tiers.some((t) => t === null)) return null;

    const detectedCategory =
      typeof p.detectedCategory === "string" && CATEGORY_VALUES.includes(p.detectedCategory)
        ? p.detectedCategory
        : null;

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
      foreignNationalEligible: p.foreignNationalEligible,
      itinEligible: p.itinEligible,
      ruralEligible: p.ruralEligible,
      tiers: tiers as ExtractedCriteriaTier[],
      extractionNotes: p.extractionNotes,
      detectedCategory,
    };
  }
}

function parseExtraction(text: string): ExtractedCriteria | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return parseExtractionObject(JSON.parse(match[0]) as Record<string, unknown>);
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

  const blocks = await resolveExtractionBlocks(doc, EXTRACTION_LIMITS);
  if (!blocks) {
    return emptyCriteria("Couldn't extract any readable text or images from this document.");
  }

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 8000,
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
      foreignNationalEligible: null,
      itinEligible: null,
      ruralEligible: null,
      tiers: [],
      extractionNotes: "Extraction ran but the response couldn't be parsed — needs a manual look or a re-run.",
      detectedCategory: null,
    };
  }
  return parsed;
}

function emptyCriteria(extractionNotes: string | null): ExtractedCriteria {
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
    foreignNationalEligible: null,
    itinEligible: null,
    ruralEligible: null,
    tiers: [],
    extractionNotes,
    detectedCategory: null,
  };
}

export interface ExtractedPrograms {
  /** One entry per loan program in the document, each tagged with its category (never two for the same category). */
  programs: ExtractedCriteria[];
  /** Lender-wide facts (foreign national / ITIN / rural) and notes about anything not captured in a program. */
  general: ExtractedCriteria;
}

/** Keeps one entry per category, so a model that repeats a category can't overwrite its own earlier entry. */
export function dedupePrograms(programs: ExtractedCriteria[]): ExtractedCriteria[] {
  const byCategory = new Map<string, ExtractedCriteria>();
  for (const p of programs) {
    if (!p.detectedCategory) continue;
    const seen = byCategory.get(p.detectedCategory);
    if (!seen) {
      byCategory.set(p.detectedCategory, p);
    } else {
      byCategory.set(p.detectedCategory, {
        ...seen,
        tiers: [...seen.tiers, ...p.tiers],
        extractionNotes: [seen.extractionNotes, p.extractionNotes].filter(Boolean).join(" ") || null,
      });
    }
  }
  return [...byCategory.values()];
}

/**
 * Same one-time read as extractLenderCriteria, for a document that may hold several loan programs (a lender's
 * "complete package"): returns separate criteria for each program found so each can be filed under its own
 * product, instead of giving up on the whole document because it isn't about a single program.
 */
export async function extractLenderPrograms(doc: { fileName: string; mimeType: string; data: string }): Promise<ExtractedPrograms> {
  if (!anthropic) {
    throw new Error("AI extraction isn't configured (missing ANTHROPIC_API_KEY).");
  }

  const blocks = await resolveExtractionBlocks(doc, EXTRACTION_LIMITS);
  if (!blocks) {
    return { programs: [], general: emptyCriteria("Couldn't extract any readable text or images from this document.") };
  }

  const response = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 12000,
    thinking: { type: "disabled" },
    system: PROGRAMS_SYSTEM_PROMPT,
    messages: [{ role: "user", content: blocks }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const match = textBlock && textBlock.type === "text" ? textBlock.text.match(/\{[\s\S]*\}/) : null;
  let raw: Record<string, unknown> | null = null;
  try {
    raw = match ? (JSON.parse(match[0]) as Record<string, unknown>) : null;
  } catch {
    raw = null;
  }
  if (!raw || !Array.isArray(raw.programs)) {
    return { programs: [], general: emptyCriteria("Extraction ran but the response couldn't be parsed — needs a manual look or a re-run.") };
  }

  // An entry the checker rejects is dropped rather than failing the whole document; the others still get filed.
  const programs = dedupePrograms(
    raw.programs.flatMap((entry) => {
      const parsed = entry && typeof entry === "object" ? parseExtractionObject(entry as Record<string, unknown>) : null;
      return parsed ? [parsed] : [];
    })
  );

  const g = raw.general && typeof raw.general === "object" ? (raw.general as Record<string, unknown>) : {};
  const general = emptyCriteria(typeof g.extractionNotes === "string" ? g.extractionNotes : null);
  if (isBoolOrNull(g.foreignNationalEligible)) general.foreignNationalEligible = g.foreignNationalEligible ?? null;
  if (isBoolOrNull(g.itinEligible)) general.itinEligible = g.itinEligible ?? null;
  if (isBoolOrNull(g.ruralEligible)) general.ruralEligible = g.ruralEligible ?? null;

  return { programs, general };
}
