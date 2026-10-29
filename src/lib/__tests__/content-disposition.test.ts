import { describe, expect, it } from "vitest";
import { contentDisposition } from "@/lib/content-disposition";

describe("contentDisposition", () => {
  it("can be put in a header for a Mac screenshot name (narrow no-break space)", () => {
    const value = contentDisposition("inline", "Screenshot 2026-10-29 at 11.03.27\u202fAM.png");
    expect(() => new Response("x", { headers: { "Content-Disposition": value } })).not.toThrow();
    expect(value).toContain('filename="Screenshot 2026-10-29 at 11.03.27 AM.png"');
    expect(value).toContain("filename*=UTF-8''Screenshot%202026-10-29%20at%2011.03.27%20AM.png");
  });
  it("handles accents, quotes and line breaks", () => {
    const value = contentDisposition("attachment", 'Résumé "final"\r\n.pdf');
    expect(() => new Response("x", { headers: { "Content-Disposition": value } })).not.toThrow();
    expect(value).not.toMatch(/["\r\n].*"\r|\r|\n/);
    expect(value.startsWith("attachment; filename=")).toBe(true);
  });
  it("never produces an empty name", () => {
    expect(contentDisposition("inline", "")).toContain('filename="file"');
  });
});
