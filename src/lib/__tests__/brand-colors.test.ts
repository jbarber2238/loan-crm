import { describe, expect, it } from "vitest";
import { contrast, derivePortalTheme, mix, normalizeHex, pickBrandColors, readableOn } from "@/lib/brand-colors";

describe("brand colors", () => {
  it("normalizes hex input", () => {
    expect(normalizeHex("fa5f05")).toBe("#FA5F05");
    expect(normalizeHex("#abc")).toBe("#AABBCC");
    expect(normalizeHex("nope")).toBeNull();
    expect(normalizeHex("")).toBeNull();
  });

  it("matches the design board's Manna numbers", () => {
    const t = derivePortalTheme("#0B0C0D", "#FA5F05");
    expect(t.headText).toBe("#FFFFFF");
    expect(t.headRatio).toBeGreaterThan(19);
    expect(t.on).toBe("#0B0C0D");
    expect(t.onRatio).toBeGreaterThan(6);
    expect(t.soft).toBe("#FDB78F");
    // The board hand-tuned this one by a single step; the formula lands within one.
    expect(["#FFF0E6", "#FFEFE6"]).toContain(t.tint);
    expect(["#A33D03", "#A33E03"]).toContain(t.ink);
  });

  it("picks readable text on light and dark colors", () => {
    expect(readableOn("#FFFFFF").color).toBe("#0B0C0D");
    expect(readableOn("#14213D").color).toBe("#FFFFFF");
    expect(contrast("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
  });

  it("keeps the accent text readable on its tint even for pale accents", () => {
    const t = derivePortalTheme("#14213D", "#F2D16B");
    expect(contrast(t.ink, t.tint)).toBeGreaterThanOrEqual(4.5);
  });

  it("blends colors", () => {
    expect(mix("#000000", "#FFFFFF", 0.5)).toBe("#808080");
  });

  it("picks a dark header and a vivid button color from a palette", () => {
    const picked = pickBrandColors([
      { hex: "#F5F5F5", name: "Paper", usage: null },
      { hex: "#14213D", name: "Navy", usage: null },
      { hex: "#2EC4B6", name: "Teal", usage: null },
    ]);
    expect(picked).toEqual({ header: "#14213D", accent: "#2EC4B6" });
  });

  it("returns null for an empty palette", () => {
    expect(pickBrandColors([])).toBeNull();
  });
});
