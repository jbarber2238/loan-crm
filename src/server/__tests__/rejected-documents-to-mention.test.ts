import { describe, expect, it } from "vitest";
import { formatStatusList, groupRejectionsByNote, rejectedDocumentsToMention } from "@/server/client-needs-email-format";

describe("groupRejectionsByNote", () => {
  it("lists files that share a reason together, once", () => {
    const groups = groupRejectionsByNote([
      { fileName: "a.pdf", rejectionNote: "please upload official statements" },
      { fileName: "b.pdf", rejectionNote: "please upload official statements" },
    ]);
    expect(groups).toEqual([{ fileNames: ["a.pdf", "b.pdf"], note: "please upload official statements" }]);
  });

  it("keeps files with different reasons on their own lines, in order", () => {
    const groups = groupRejectionsByNote([
      { fileName: "a.pdf", rejectionNote: "blurry" },
      { fileName: "b.pdf", rejectionNote: "wrong month" },
      { fileName: "c.pdf", rejectionNote: "blurry" },
    ]);
    expect(groups).toEqual([
      { fileNames: ["a.pdf", "c.pdf"], note: "blurry" },
      { fileNames: ["b.pdf"], note: "wrong month" },
    ]);
  });

  it("prints a shared reason once in the email", () => {
    const html = formatStatusList(
      [{ itemName: "Bank Statements", documents: [
        { fileName: "a.pdf", rejectionNote: "use official PDFs" },
        { fileName: "b.pdf", rejectionNote: "use official PDFs" },
      ] }],
      []
    );
    expect(html.match(/use official PDFs/g)).toHaveLength(1);
    expect(html).toContain("a.pdf, b.pdf");
    expect(html).toContain("Reason: use official PDFs");
  });

  it("sets the reason apart in bold so the borrower can't miss it", () => {
    const html = formatStatusList(
      [{ itemName: "Purchase Agreement", documents: [{ fileName: "pa.pdf", rejectionNote: "remove Seller Financing" }] }],
      []
    );
    expect(html).toMatch(/font-weight:700;[^"]*">Reason: remove Seller Financing</);
  });

  it("leaves the file name off for a form", () => {
    const html = formatStatusList(
      [{ itemName: "Application", hideFileNames: true, documents: [{ fileName: "form.pdf", rejectionNote: "sign page 2" }] }],
      []
    );
    expect(html).not.toContain("form.pdf");
    expect(html).toContain("Reason: sign page 2");
  });
});

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

describe("rejectedDocumentsToMention with archived reasons", () => {
  const at = new Date("2026-11-01T00:00:00Z");
  it("leaves out rejected documents whose reason was archived", () => {
    const docs = [
      { id: "a", reviewStatus: "rejected", createdAt: at, rejectionNoteArchivedAt: null },
      { id: "b", reviewStatus: "rejected", createdAt: at, rejectionNoteArchivedAt: at },
    ];
    expect(rejectedDocumentsToMention({ needType: "document_upload", documents: docs }).map((d) => d.id)).toEqual(["a"]);
  });

  it("does not mention a form whose newest rejected copy has its reason archived", () => {
    const docs = [{ id: "a", reviewStatus: "rejected", createdAt: at, rejectionNoteArchivedAt: at }];
    expect(rejectedDocumentsToMention({ needType: "pandadoc_form", documents: docs })).toEqual([]);
  });
});
