import { describe, expect, it } from "vitest";
import { collectCustomFormAnswers } from "@/lib/custom-need-forms/answers";
import type { CustomFormDefinition } from "@/lib/custom-need-forms/types";

const definition: CustomFormDefinition = {
  key: "t",
  label: "Test",
  sections: [
    {
      title: "A",
      fields: [
        { name: "first", label: "First", type: "text" },
        { name: "notes", label: "Notes", type: "textarea", optional: true },
      ],
    },
  ],
};

const from = (values: Record<string, FormDataEntryValue>) => (name: string) => values[name] ?? null;

describe("collectCustomFormAnswers", () => {
  it("keeps trimmed answers and leaves blanks out", () => {
    expect(collectCustomFormAnswers(definition, from({ first: "  Ana ", notes: "   " }))).toEqual({ first: "Ana" });
  });

  it("ignores anything the form does not define", () => {
    expect(collectCustomFormAnswers(definition, from({ first: "Ana", injected: "x" }))).toEqual({ first: "Ana" });
  });

  it("ignores file values", () => {
    expect(collectCustomFormAnswers(definition, from({ first: new File(["x"], "x.txt") }))).toEqual({});
  });

  it("caps each answer when a limit is given", () => {
    expect(collectCustomFormAnswers(definition, from({ first: "abcdef" }), 3)).toEqual({ first: "abc" });
  });
});
