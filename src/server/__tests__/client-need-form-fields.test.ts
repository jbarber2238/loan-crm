import { describe, expect, it } from "vitest";
import { dealNeedTypeFrom, formQuestionsFrom } from "@/server/client-need-form-fields";

function fd(entries: [string, string][]) {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
}

describe("formQuestionsFrom", () => {
  it("lines up text, required flag and answer-row id by row, and drops blank questions", () => {
    const f = fd([
      ["questionText", "Why were you late?"], ["questionRequired", "1"], ["questionId", "abc"],
      ["questionText", "   "], ["questionRequired", "0"], ["questionId", ""],
      ["questionText", "Anything else?"], ["questionRequired", "0"], ["questionId", ""],
    ]);
    expect(formQuestionsFrom(f)).toEqual([
      { id: "abc", questionText: "Why were you late?", required: true },
      { id: null, questionText: "Anything else?", required: false },
    ]);
  });
});

describe("dealNeedTypeFrom", () => {
  it("accepts every real type and falls back to document upload", () => {
    expect(dealNeedTypeFrom(fd([["needType", "link"]]))).toBe("link");
    expect(dealNeedTypeFrom(fd([["needType", "custom_form"]]))).toBe("custom_form");
    expect(dealNeedTypeFrom(fd([["needType", "nonsense"]]))).toBe("document_upload");
    expect(dealNeedTypeFrom(fd([]))).toBe("document_upload");
  });
});
