// Brand color math for the borrower portal. A company picks two colors (a header color and a
// button/progress color); everything else the portal needs is worked out from them so the page
// stays readable whatever they choose.

export type Rgb = { r: number; g: number; b: number };

const ONYX = "#0B0C0D";
const WHITE = "#FFFFFF";

/** "#abc" or "#aabbcc" (with or without the #) → "#AABBCC", or null if it isn't a hex color. */
export function normalizeHex(input: string | null | undefined): string | null {
  if (!input) return null;
  let h = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return `#${h.toUpperCase()}`;
}

export function hexToRgb(hex: string): Rgb {
  const h = normalizeHex(hex);
  if (!h) throw new Error(`Not a hex color: ${hex}`);
  return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/** Blend `hex` toward `toward` by `amount` (0 = hex, 1 = toward). */
export function mix(hex: string, toward: string, amount: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(toward);
  return rgbToHex({ r: a.r + (b.r - a.r) * amount, g: a.g + (b.g - a.g) * amount, b: a.b + (b.b - a.b) * amount });
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG contrast ratio between two colors (1 to 21). */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Whichever of white or Onyx reads better on `background`. */
export function readableOn(background: string): { color: string; ratio: number } {
  const w = contrast(background, WHITE);
  const o = contrast(background, ONYX);
  return w >= o ? { color: WHITE, ratio: w } : { color: ONYX, ratio: o };
}

export const MIN_TEXT_CONTRAST = 4.5;

export type PortalTheme = {
  head: string;
  headText: string;
  headRatio: number;
  accent: string;
  on: string;
  onRatio: number;
  /** The lighter "current stage" color. */
  soft: string;
  /** The accent as readable text on the pale tint. */
  ink: string;
  /** The pale tint behind "Needed" tags. */
  tint: string;
  /** Stages not reached yet. */
  up: string;
  headIsDark: boolean;
};

/** Everything the portal needs, derived from the two colors a company chooses. */
export function derivePortalTheme(headerHex: string, accentHex: string): PortalTheme {
  const head = normalizeHex(headerHex);
  const accent = normalizeHex(accentHex);
  if (!head || !accent) throw new Error("Both colors must be valid hex colors.");

  const headText = readableOn(head);
  const on = readableOn(accent);
  const tint = mix(accent, WHITE, 0.9);
  // Darken the accent until it's readable on its own tint.
  let ink = mix(accent, "#000000", 0.35);
  for (let i = 0; i < 6 && contrast(ink, tint) < MIN_TEXT_CONTRAST; i++) ink = mix(ink, "#000000", 0.2);

  return {
    head,
    headText: headText.color,
    headRatio: headText.ratio,
    accent,
    on: on.color,
    onRatio: on.ratio,
    soft: mix(accent, WHITE, 0.55),
    ink,
    tint,
    up: mix(head, WHITE, 0.12),
    headIsDark: headText.color === WHITE,
  };
}

/** The CSS variables the portal reads. */
export function portalCssVars(theme: PortalTheme): Record<string, string> {
  return {
    "--bp-head": theme.head,
    "--bp-head-text": theme.headText,
    "--bp-accent": theme.accent,
    "--bp-on": theme.on,
    "--bp-soft": theme.soft,
    "--bp-ink": theme.ink,
    "--bp-tint": theme.tint,
    "--bp-up": theme.up,
  };
}

export type BrandSwatch = { hex: string; name: string | null; usage: string | null };

/**
 * Choose a header and a button color from a brand palette: the header is the darkest color that
 * reads with white text, the button color is the most vivid mid-tone that reads with its text
 * color and isn't the header. Used to repair or fill in what the AI suggests.
 */
export function pickBrandColors(palette: BrandSwatch[]): { header: string; accent: string } | null {
  const colors = palette.map((p) => normalizeHex(p.hex)).filter((h): h is string => Boolean(h));
  const unique = [...new Set(colors)];
  if (unique.length === 0) return null;

  const byLum = [...unique].sort((a, b) => luminance(a) - luminance(b));
  const header = byLum.find((c) => contrast(c, WHITE) >= MIN_TEXT_CONTRAST) ?? byLum[0];

  const saturation = (hex: string) => {
    const { r, g, b } = hexToRgb(hex);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return max === 0 ? 0 : (max - min) / max;
  };
  const candidates = unique.filter((c) => c !== header && readableOn(c).ratio >= MIN_TEXT_CONTRAST);
  const accent =
    [...candidates].sort((a, b) => saturation(b) - saturation(a))[0] ??
    unique.find((c) => c !== header) ??
    header;
  return { header, accent };
}
