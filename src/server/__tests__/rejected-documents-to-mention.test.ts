import { describe, expect, it } from "vitest";
import { rejectedDocumentsToMention } from "@/server/client-needs-email-format";

const doc = (id: string, reviewStatus: string, day: number) => ({ id, reviewStatus, createdAt: new Date(2026, 10, day) });

describe("rejectedDocumentsToMention", () => {
  it("lists every rejected file on an ordinary upload need", () => {
    const need = { needType: "document_upload", documents: [doc("a", "rejected", 1), doc("b", "approved", 2), doc("c", "rejected", 3)] };
    expect(rejectedDocumentsToMention(need).map((d) => d.id)).toEqual(["a", "c"]);
  });

  it("lists only the newest copy of a PandaDoc form, once reopened twice", () => {
    const need = { needType: "pandadoc_form", documents: [doc("a", "rejected", 1), doc("b", "rejected", 2)] };
    expect(rejectedDocumentsToMention(need).map((d) => d.id)).toEqual(["b"]);
  });

  it("says nothing about an older rejection once the newer PandaDoc copy is pending or approved", () => {
    expect(rejectedDocumentsToMention({ needType: "pandadoc_form", documents: [doc("a", "rejected", 1), doc("b", "pending", 2)] })).toEqual([]);
    expect(rejectedDocumentsToMention({ needType: "pandadoc_form", documents: [doc("a", "rejected", 1), doc("b", "approved", 2)] })).toEqual([]);
  });

  it("handles a PandaDoc form with no copies", () => {
    expect(rejectedDocumentsToMention({ needType: "pandadoc_form", documents: [] })).toEqual([]);
  });
});
