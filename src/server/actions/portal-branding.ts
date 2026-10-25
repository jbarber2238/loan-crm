"use server";

import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db/client";
import { companySettings } from "@/server/db/schema";
import { requireAdmin } from "@/server/auth/guards";
import { fail } from "@/lib/action-result";
import { fileToContentBlock } from "@/server/ai/file-content-block";
import { normalizeHex, pickBrandColors, type BrandSwatch } from "@/lib/brand-colors";

const MAX_BRAND_KIT_SIZE = 15 * 1024 * 1024;

export type BrandKitResult = {
  palette: BrandSwatch[];
  header: string;
  /** Progress bar and stage bar. */
  accent: string;
  /** Upload buttons. */
  button: string;
  notes: string | null;
};

function cleanPalette(input: unknown): BrandSwatch[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: BrandSwatch[] = [];
  for (const item of input) {
    const hex = normalizeHex((item as { hex?: unknown })?.hex as string | undefined);
    if (!hex || seen.has(hex)) continue;
    seen.add(hex);
    const name = (item as { name?: unknown }).name;
    const usage = (item as { usage?: unknown }).usage;
    out.push({
      hex,
      name: typeof name === "string" && name.trim() ? name.trim().slice(0, 40) : null,
      usage: typeof usage === "string" && usage.trim() ? usage.trim().slice(0, 80) : null,
    });
    if (out.length === 16) break;
  }
  return out;
}

const SYSTEM_PROMPT = `You are reading a company's brand kit (a brand guidelines PDF, a style sheet, a logo sheet or image, or an SVG) to find its exact brand colors.

Rules:
- Report colors EXACTLY as the brand kit states them. If it prints a hex code, use that hex. If it only prints RGB, convert to hex; if only CMYK or Pantone, use the sRGB hex value if it's printed next to it, otherwise your best exact conversion. If the kit shows a color only as a swatch or in artwork, read the color as precisely as you can. Never invent colors that aren't in the kit and never "improve" a brand color.
- List every distinct brand color you can find (up to 12), including neutrals the brand names explicitly, each with the brand's own name for it if there is one and a short note on how the kit says to use it (primary, secondary, accent, background, text...).
- Then choose three of those listed colors for a borrower-facing web page:
  - "header": the page header background. Prefer the brand's primary dark color, or its primary color if nothing is dark. White or near-black text will be placed on it automatically, so any color with enough contrast works; prefer deeper, more saturated brand colors over pale ones.
  - "progress": the color of the progress bar and the loan-stage bar. Prefer the brand's main accent / highlight color: vivid and clearly different from the header.
  - "button": the color of the upload buttons. Prefer the brand's call-to-action color. If the brand has only one accent color, use the same color as "progress"; if it has two, use the second one here.
  Avoid plain white, black or grey for progress and button unless the brand has nothing else. All three must come from your palette list; the header must differ from the other two.

Respond with ONLY a JSON object, no prose outside it:
{"palette":[{"hex":"#RRGGBB","name":"<brand name or null>","usage":"<short note or null>"}],"header":"#RRGGBB","progress":"#RRGGBB","button":"#RRGGBB","notes":"<one or two sentences on how you chose, or null>"}`;

/**
 * Reads an uploaded brand kit and suggests the portal's header and button colors. Suggestions
 * only: nothing is saved here, so the admin can change either color before saving.
 */
export async function extractBrandKit(formData: FormData): Promise<BrandKitResult | { error: string }> {
  await requireAdmin();
  const file = formData.get("brandKit");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a brand kit file to read.");
  if (file.size > MAX_BRAND_KIT_SIZE) return fail(`${file.name} is too large (15MB max).`);
  if (!process.env.ANTHROPIC_API_KEY) return fail("AI isn't configured (missing ANTHROPIC_API_KEY).");

  const mime = (file.type || "").toLowerCase();
  const lowerName = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  let block: Anthropic.ContentBlockParam | null = null;
  if (mime === "image/svg+xml" || lowerName.endsWith(".svg") || mime.startsWith("text/") || lowerName.endsWith(".css") || lowerName.endsWith(".json")) {
    // Vector and text files carry their colors as plain text; hand it over as text.
    block = { type: "text", text: `File name: ${file.name}\n\n${buffer.toString("utf8").slice(0, 120_000)}` };
  } else {
    block = fileToContentBlock({ fileName: file.name, mimeType: mime, dataBase64: buffer.toString("base64") });
  }
  if (!block) {
    return fail("That file type can't be read here. Upload the brand guidelines as a PDF, or a PNG, JPG or SVG of the colors.");
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let raw = "";
  try {
    const response = await client.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1800,
      thinking: { type: "disabled" },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: [block, { type: "text", text: "Find the brand colors in this file." }] }],
    });
    const text = response.content.find((b) => b.type === "text");
    raw = text && text.type === "text" ? text.text : "";
  } catch (err) {
    console.error("extractBrandKit failed:", err);
    return fail("The AI couldn't read that file. Try again, or enter the two colors by hand.");
  }

  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return fail("The AI didn't return any colors from that file. Enter them by hand, or try a clearer file.");
  let parsed: { palette?: unknown; header?: unknown; progress?: unknown; button?: unknown; notes?: unknown };
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return fail("The AI's answer couldn't be read. Try again, or enter the colors by hand.");
  }

  const palette = cleanPalette(parsed.palette);
  if (palette.length === 0) return fail("No brand colors were found in that file. Enter them by hand, or try the brand guidelines PDF.");

  // Trust the AI's choices only if they're real swatches from its own list; otherwise pick by rule.
  const inPalette = (v: unknown) => {
    const h = normalizeHex(typeof v === "string" ? v : null);
    return h && palette.some((p) => p.hex === h) ? h : null;
  };
  let header = inPalette(parsed.header);
  let accent = inPalette(parsed.progress);
  let button = inPalette(parsed.button);
  if (!header || !accent || header === accent) {
    const picked = pickBrandColors(palette);
    if (!picked) return fail("No usable brand colors were found in that file.");
    header = picked.header;
    accent = picked.accent;
    button = null;
  }
  if (!button || button === header) button = accent;

  return {
    palette,
    header,
    accent,
    button,
    notes: typeof parsed.notes === "string" && parsed.notes.trim() ? parsed.notes.trim().slice(0, 400) : null,
  };
}

/** Save the two colors (and the palette they came from). Both must be valid hex colors. */
export async function savePortalBranding(formData: FormData) {
  await requireAdmin();
  const header = normalizeHex(String(formData.get("headerColor") ?? ""));
  const accent = normalizeHex(String(formData.get("progressColor") ?? ""));
  const button = normalizeHex(String(formData.get("buttonColor") ?? ""));
  if (!header) return fail("Header color needs to be a hex color like #14213D.");
  if (!accent) return fail("Progress bar color needs to be a hex color like #2EC4B6.");
  if (!button) return fail("Upload button color needs to be a hex color like #F2A65A.");

  let palette: BrandSwatch[] | null = null;
  const rawPalette = formData.get("palette");
  if (typeof rawPalette === "string" && rawPalette.trim()) {
    try {
      palette = cleanPalette(JSON.parse(rawPalette));
    } catch {
      palette = null;
    }
  }

  await db
    .insert(companySettings)
    .values({
      id: "default",
      name: "",
      portalHeaderColor: header,
      portalAccentColor: accent,
      portalButtonColor: button,
      ...(palette ? { portalBrandPalette: palette } : {}),
    })
    .onConflictDoUpdate({
      target: companySettings.id,
      set: {
        portalHeaderColor: header,
        portalAccentColor: accent,
        portalButtonColor: button,
        ...(palette ? { portalBrandPalette: palette } : {}),
        updatedAt: new Date(),
      },
    });
  revalidatePath("/settings/company");
  return { saved: true as const };
}

/** Back to the standard look: clears both colors and the saved palette. */
export async function resetPortalBranding() {
  await requireAdmin();
  await db
    .update(companySettings)
    .set({ portalHeaderColor: null, portalAccentColor: null, portalButtonColor: null, portalBrandPalette: null, updatedAt: new Date() })
    .where(eq(companySettings.id, "default"));
  revalidatePath("/settings/company");
  return { saved: true as const };
}
