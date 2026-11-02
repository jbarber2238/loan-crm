import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, applyTint, borderToCss, colorToCss, columnWidthPx, rowHeightPx, themePaletteFromXml } from "@/lib/spreadsheet-styles";

describe("colorToCss", () => {
  it("reads plain colors, dropping the alpha byte", () => {
    expect(colorToCss({ argb: "FF1F3864" }, DEFAULT_THEME)).toBe("#1F3864");
  });

  it("looks theme colors up in the palette", () => {
    expect(colorToCss({ theme: 4 }, DEFAULT_THEME)).toBe("#4472C4");
    expect(colorToCss({ theme: 0 }, DEFAULT_THEME)).toBe("#FFFFFF");
  });

  it("applies a tint: negative darkens, positive lightens", () => {
    expect(applyTint("FFFFFF", -0.5)).toBe("808080");
    expect(applyTint("000000", 0.5)).toBe("808080");
    expect(colorToCss({ theme: 0, tint: -0.15 }, DEFAULT_THEME)).toBe("#D9D9D9");
  });

  it("returns null for no color or an unreadable one", () => {
    expect(colorToCss(undefined, DEFAULT_THEME)).toBeNull();
    expect(colorToCss({ argb: "bad" }, DEFAULT_THEME)).toBeNull();
    expect(colorToCss({ indexed: 64 }, DEFAULT_THEME)).toBeNull();
  });
});

describe("themePaletteFromXml", () => {
  it("reads the colors a workbook's own theme defines", () => {
    const xml = `<a:clrScheme><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="123456"/></a:dk2><a:lt2><a:srgbClr val="EEEEEE"/></a:lt2><a:accent1><a:srgbClr val="C00000"/></a:accent1></a:clrScheme>`;
    const palette = themePaletteFromXml(xml);
    expect(palette[0]).toBe("FFFFFF");
    expect(palette[1]).toBe("000000");
    expect(palette[2]).toBe("EEEEEE");
    expect(palette[3]).toBe("123456");
    expect(palette[4]).toBe("C00000");
    expect(palette[5]).toBe(DEFAULT_THEME[5]);
  });

  it("falls back to Excel's default colors", () => {
    expect(themePaletteFromXml(undefined)).toEqual(DEFAULT_THEME);
  });
});

describe("borders and sizes", () => {
  it("maps Excel border styles to CSS", () => {
    expect(borderToCss({ style: "thin", color: { argb: "FF000000" } }, DEFAULT_THEME)).toBe("1px solid #000000");
    expect(borderToCss({ style: "medium" }, DEFAULT_THEME)).toBe("2px solid #000000");
    expect(borderToCss({ style: "dashed" }, DEFAULT_THEME)).toBe("1px dashed #000000");
    expect(borderToCss({}, DEFAULT_THEME)).toBeNull();
    expect(borderToCss(undefined, DEFAULT_THEME)).toBeNull();
  });

  it("converts Excel column widths and row heights to pixels", () => {
    expect(columnWidthPx(8.43)).toBe(64);
    expect(columnWidthPx(undefined)).toBe(64);
    expect(rowHeightPx(15)).toBe(20);
    expect(rowHeightPx(30)).toBe(40);
  });
});
