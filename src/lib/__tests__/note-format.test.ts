import { describe, expect, it } from "vitest";
import { parseInline, parseNoteBlocks } from "../note-format";

describe("parseInline", () => {
  it("marks **bold** runs", () => {
    expect(parseInline("a **b** c")).toEqual([
      { text: "a ", bold: false },
      { text: "b", bold: true },
      { text: " c", bold: false },
    ]);
  });
  it("leaves stray asterisks and spaced marks alone", () => {
    expect(parseInline("5 * 3 = 15")).toEqual([{ text: "5 * 3 = 15", bold: false }]);
    expect(parseInline("** not bold **")).toEqual([{ text: "** not bold **", bold: false }]);
  });
});

describe("parseNoteBlocks", () => {
  it("keeps plain notes as one text block with their line breaks", () => {
    expect(parseNoteBlocks("line one\n\nline two")).toEqual([{ kind: "text", text: "line one\n\nline two" }]);
  });
  it("reads the old • bullets and new - bullets as a list", () => {
    expect(parseNoteBlocks("Outstanding:\n• Appraisal\n- Insurance")).toEqual([
      { kind: "text", text: "Outstanding:" },
      { kind: "ul", items: ["Appraisal", "Insurance"] },
    ]);
  });
  it("reads numbered lines and keeps the starting number", () => {
    expect(parseNoteBlocks("3. a\n4. b")).toEqual([{ kind: "ol", items: ["a", "b"], start: 3 }]);
  });
  it("is not fooled by a bold line that starts with asterisks", () => {
    expect(parseNoteBlocks("**Heads up** the title is late")).toEqual([{ kind: "text", text: "**Heads up** the title is late" }]);
  });
});
