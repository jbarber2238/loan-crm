import { describe, expect, it } from "vitest";
import { normalizeLinkUrl, notePlainText, parseInlineTree, parseNoteBlocks, segmentNote } from "../note-format";

const t = (text: string) => ({ type: "text", text });

describe("parseInlineTree", () => {
  it("reads bold, italic, underline and strikethrough", () => {
    expect(parseInlineTree("a **b** _c_ ++d++ ~~e~~")).toEqual([
      t("a "),
      { type: "bold", children: [t("b")] },
      t(" "),
      { type: "italic", children: [t("c")] },
      t(" "),
      { type: "underline", children: [t("d")] },
      t(" "),
      { type: "strike", children: [t("e")] },
    ]);
  });
  it("nests marks", () => {
    expect(parseInlineTree("**big _deal_**")).toEqual([{ type: "bold", children: [t("big "), { type: "italic", children: [t("deal")] }] }]);
  });
  it("reads links, only for web and email addresses", () => {
    expect(parseInlineTree("see [the file](https://x.com/a)")).toEqual([t("see "), { type: "link", href: "https://x.com/a", children: [t("the file")] }]);
    expect(parseInlineTree("[x](javascript:alert(1))")).toEqual([t("[x](javascript:alert(1))")]);
  });
  it("leaves stray marks, spaced marks and snake_case alone", () => {
    expect(parseInlineTree("5 * 3 = 15")).toEqual([t("5 * 3 = 15")]);
    expect(parseInlineTree("** not bold **")).toEqual([t("** not bold **")]);
    expect(parseInlineTree("file_name_here and __init__")).toEqual([t("file_name_here and __init__")]);
    expect(parseInlineTree("1 + 1 ++ 2")).toEqual([t("1 + 1 ++ 2")]);
  });
});

describe("notePlainText", () => {
  it("drops marks, bullets and quote signs", () => {
    expect(notePlainText("  • **Title** is [late](https://a.co)")).toBe("Title is late");
    expect(notePlainText("> _quoted_")).toBe("quoted");
  });
});

describe("normalizeLinkUrl", () => {
  it("accepts web and email addresses and fixes bare ones", () => {
    expect(normalizeLinkUrl("https://a.com/x")).toBe("https://a.com/x");
    expect(normalizeLinkUrl("a.com/x")).toBe("https://a.com/x");
    expect(normalizeLinkUrl("tom@a.com")).toBe("mailto:tom@a.com");
  });
  it("refuses anything else", () => {
    expect(normalizeLinkUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeLinkUrl("two words")).toBeNull();
    expect(normalizeLinkUrl("")).toBeNull();
  });
});

describe("parseNoteBlocks", () => {
  it("keeps plain notes as one text block with their line breaks", () => {
    expect(parseNoteBlocks("line one\n\nline two")).toEqual([{ kind: "text", text: "line one\n\nline two" }]);
  });
  it("reads the old • bullets and new - bullets as one list", () => {
    expect(parseNoteBlocks("Outstanding:\n• Appraisal\n- Insurance")).toEqual([
      { kind: "text", text: "Outstanding:" },
      { kind: "list", lists: [{ ordered: false, start: 1, items: [{ text: "Appraisal", children: [] }, { text: "Insurance", children: [] }] }] },
    ]);
  });
  it("reads numbered lines and keeps the starting number", () => {
    expect(parseNoteBlocks("3. a\n4. b")).toEqual([{ kind: "list", lists: [{ ordered: true, start: 3, items: [{ text: "a", children: [] }, { text: "b", children: [] }] }] }]);
  });
  it("nests indented items under the item above", () => {
    const [block] = parseNoteBlocks("• a\n  • a1\n  • a2\n    1. deep\n• b");
    expect(block).toEqual({
      kind: "list",
      lists: [
        {
          ordered: false,
          start: 1,
          items: [
            {
              text: "a",
              children: [
                {
                  ordered: false,
                  start: 1,
                  items: [
                    { text: "a1", children: [] },
                    { text: "a2", children: [{ ordered: true, start: 1, items: [{ text: "deep", children: [] }] }] },
                  ],
                },
              ],
            },
            { text: "b", children: [] },
          ],
        },
      ],
    });
  });
  it("never nests the first item or skips a level", () => {
    const [block] = parseNoteBlocks("    • a\n        • b");
    expect(block).toMatchObject({ kind: "list", lists: [{ items: [{ text: "a", children: [{ items: [{ text: "b" }] }] }] }] });
  });
  it("groups quote lines", () => {
    expect(parseNoteBlocks("> one\n> two\nafter")).toEqual([
      { kind: "quote", lines: ["one", "two"] },
      { kind: "text", text: "after" },
    ]);
  });
  it("is not fooled by a bold line that starts with asterisks", () => {
    expect(parseNoteBlocks("**Heads up** the title is late")).toEqual([{ kind: "text", text: "**Heads up** the title is late" }]);
  });
});

describe("segmentNote", () => {
  it("keeps every blank line, which the end-of-day sections rely on", () => {
    expect(segmentNote("A:\n• x\n\n\nB:")).toEqual([
      { kind: "line", text: "A:" },
      { kind: "list", lists: [{ ordered: false, start: 1, items: [{ text: "x", children: [] }] }] },
      { kind: "line", text: "" },
      { kind: "line", text: "" },
      { kind: "line", text: "B:" },
    ]);
  });
});
