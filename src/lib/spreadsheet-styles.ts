// Turns a spreadsheet cell's formatting (colors, borders, fonts) into CSS. Pure, so it can be tested without a file.

export interface XlColor {
  argb?: string;
  theme?: number;
  tint?: number;
  indexed?: number;
}

/** The ten colors a workbook's theme defines, in the order theme numbers 0 to 9 refer to them. */
export type ThemePalette = string[];

// Excel's default Office palette, used when a file doesn't carry its own theme.
export const DEFAULT_THEME: ThemePalette = ["FFFFFF", "000000", "E7E6E6", "44546A", "4472C4", "ED7D31", "A5A5A5", "FFC000", "5B9BD5", "70AD47"];

// Excel stores theme colors 0-3 as light1, dark1, light2, dark2; the theme file lists them dark first.
const THEME_FILE_ORDER = ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6"];

/** Reads the theme palette out of a workbook's theme XML. Falls back to Excel's defaults for anything it can't find. */
export function themePaletteFromXml(xml: string | undefined): ThemePalette {
  if (!xml) return DEFAULT_THEME;
  return THEME_FILE_ORDER.map((name, i) => {
    const block = xml.match(new RegExp(`<a:${name}>([\\s\\S]*?)</a:${name}>`))?.[1] ?? "";
    const rgb = block.match(/srgbClr val="([0-9A-Fa-f]{6})"/)?.[1] ?? block.match(/lastClr="([0-9A-Fa-f]{6})"/)?.[1];
    return (rgb ?? DEFAULT_THEME[i]).toUpperCase();
  });
}

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const hue = (p: number, q: number, t: number) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    return x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => Math.round((s === 0 ? l : hue(p, q, t)) * 255).toString(16).padStart(2, "0");
  return `${channel(h + 1 / 3)}${channel(h)}${channel(h - 1 / 3)}`.toUpperCase();
}

/** Excel's "lighter 40%" / "darker 25%" shades: the tint moves the color's lightness toward white or black. */
export function applyTint(hex: string, tint: number): string {
  if (!tint) return hex;
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s, tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint);
}

/** A cell color as a CSS color, or null when it has none (or is Excel's "automatic"). */
export function colorToCss(color: XlColor | undefined, theme: ThemePalette): string | null {
  if (!color) return null;
  if (color.argb) {
    const rgb = color.argb.length === 8 ? color.argb.slice(2) : color.argb;
    return /^[0-9A-Fa-f]{6}$/.test(rgb) ? `#${rgb.toUpperCase()}` : null;
  }
  if (color.theme !== undefined && theme[color.theme]) return `#${applyTint(theme[color.theme], color.tint ?? 0)}`;
  return null;
}

export interface XlBorderSide {
  style?: string;
  color?: XlColor;
}

/** One cell edge as a CSS border value. Excel's "hair", "dotted" and "dashed" become their CSS equivalents. */
export function borderToCss(side: XlBorderSide | undefined, theme: ThemePalette): string | null {
  if (!side?.style) return null;
  const color = colorToCss(side.color, theme) ?? "#000000";
  switch (side.style) {
    case "thin":
      return `1px solid ${color}`;
    case "hair":
      return `1px dotted ${color}`;
    case "dotted":
      return `1px dotted ${color}`;
    case "dashed":
    case "mediumDashed":
    case "dashDot":
    case "mediumDashDot":
    case "dashDotDot":
    case "mediumDashDotDot":
    case "slantDashDot":
      return `${side.style.startsWith("medium") ? 2 : 1}px dashed ${color}`;
    case "medium":
      return `2px solid ${color}`;
    case "thick":
      return `3px solid ${color}`;
    case "double":
      return `3px double ${color}`;
    default:
      return `1px solid ${color}`;
  }
}

/** Column width in Excel's "characters" to screen pixels. */
export function columnWidthPx(chars: number | undefined): number {
  return Math.round((chars ?? 8.43) * 7 + 5);
}

/** Row height in points to screen pixels. */
export function rowHeightPx(points: number | undefined): number {
  return Math.round(((points ?? 15) * 4) / 3);
}
