import { describe, expect, it } from "vitest";
import { attachmentNameParam } from "@/server/gmail/encode";

describe("attachmentNameParam", () => {
  it("leaves plain names alone", () => {
    expect(attachmentNameParam("filename", "term sheet.pdf")).toBe('filename="term sheet.pdf"');
  });
  it("adds the real name for a Mac screenshot and keeps an ASCII fallback", () => {
    const v = attachmentNameParam("filename", "Screenshot at 11.03.27 AM.png");
    expect(v).toContain('filename="Screenshot at 11.03.27 AM.png"');
    expect(v).toContain("filename*=UTF-8''Screenshot%20at%2011.03.27%20AM.png");
  });
});
