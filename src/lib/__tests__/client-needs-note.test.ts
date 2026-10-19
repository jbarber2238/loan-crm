import { describe, expect, it } from "vitest";
import { CLIENT_NEEDS_NOTE_MAX, normalizeClientNeedsNote } from "@/lib/client-needs-note";

describe("normalizeClientNeedsNote", () => {
  it("trims the note and keeps its line breaks", () => {
    expect(normalizeClientNeedsNote("  Add the GC at 20%+\nAsk for the OA  ")).toEqual({ note: "Add the GC at 20%+\nAsk for the OA" });
  });

  it("treats an empty note as removing it", () => {
    expect(normalizeClientNeedsNote("   \n ")).toEqual({ note: null });
  });

  it("rejects one that is too long", () => {
    expect(normalizeClientNeedsNote("x".repeat(CLIENT_NEEDS_NOTE_MAX + 1))).toHaveProperty("error");
    expect(normalizeClientNeedsNote("x".repeat(CLIENT_NEEDS_NOTE_MAX))).toEqual({ note: "x".repeat(CLIENT_NEEDS_NOTE_MAX) });
  });
});
