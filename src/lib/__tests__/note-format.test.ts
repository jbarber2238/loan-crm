import { describe, expect, it } from "vitest";
import { continueList, parseInline, parseNoteBlocks, toggleBold, toggleList } from "../note-format";

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

describe("toggleBold", () => {
  it("wraps a selection and unwraps it again", () => {
    const on = toggleBold("call the lender", 9, 15);
    expect(on.text).toBe("call the **lender**");
    const off = toggleBold(on.text, on.start, on.end);
    expect(off.text).toBe("call the lender");
  });
  it("drops the caret between marks when nothing is selected", () => {
    const r = toggleBold("hi ", 3, 3);
    expect(r.text).toBe("hi ****");
    expect(r.start).toBe(5);
  });
  it("keeps selected spaces outside the marks", () => {
    expect(toggleBold("a word b", 1, 7).text).toBe("a **word** b");
  });
});

describe("toggleList", () => {
  it("bullets every selected line, then removes them", () => {
    const text = "one\ntwo\nthree";
    const on = toggleList(text, 0, text.length, "ul");
    expect(on.text).toBe("• one\n• two\n• three");
    expect(toggleList(on.text, on.start, on.end, "ul").text).toBe(text);
  });
  it("numbers lines and switches a bullet list to numbers", () => {
    const bullets = toggleList("a\nb", 0, 3, "ul");
    expect(toggleList(bullets.text, bullets.start, bullets.end, "ol").text).toBe("1. a\n2. b");
  });
  it("only touches the line the caret is on", () => {
    expect(toggleList("a\nb\nc", 2, 2, "ul").text).toBe("a\n• b\nc");
  });
});

describe("continueList", () => {
  it("starts the next bullet or number", () => {
    expect(continueList("• one", 5)?.text).toBe("• one\n• ");
    expect(continueList("1. one", 6)?.text).toBe("1. one\n2. ");
  });
  it("ends the list on an empty item", () => {
    expect(continueList("• one\n• ", 8)?.text).toBe("• one\n");
  });
  it("does nothing on a normal line or mid-line", () => {
    expect(continueList("plain", 5)).toBeNull();
    expect(continueList("• one two", 3)).toBeNull();
  });
});
