import { describe, expect, it } from "vitest";
import { numberToWord, termSheetReadyLine } from "@/lib/number-words";

describe("numberToWord", () => {
  it("spells out small numbers and leaves large ones as digits", () => {
    expect(numberToWord(2)).toBe("two");
    expect(numberToWord(12)).toBe("twelve");
    expect(numberToWord(20)).toBe("twenty");
    expect(numberToWord(21)).toBe("21");
  });
});

describe("termSheetReadyLine", () => {
  it("reads naturally for several, one, and none", () => {
    expect(termSheetReadyLine(3)).toBe("Your term sheets are ready. I have three options for you.");
    expect(termSheetReadyLine(1)).toBe("Your term sheet is ready. I have one option for you.");
    expect(termSheetReadyLine(0)).toBe("Your term sheets are ready.");
  });
});
