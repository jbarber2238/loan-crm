import { describe, expect, it } from "vitest";
import { DEAL_FILE_MAX_BYTES, DEAL_FILE_MAX_COUNT, mergeAuditTrail, validateDealFileBatch, validateDealFileUpload, versionLabels } from "@/lib/deal-files";

const at = (iso: string) => new Date(iso);

describe("deal file uploads", () => {
  it("needs a file", () => {
    expect(validateDealFileUpload(null, "")).toMatch(/Choose a file/);
    expect(validateDealFileUpload({ size: 0 }, "")).toMatch(/Choose a file/);
  });

  it("rejects an oversized file or note", () => {
    expect(validateDealFileUpload({ size: DEAL_FILE_MAX_BYTES + 1 }, "")).toMatch(/15MB/);
    expect(validateDealFileUpload({ size: 10 }, "x".repeat(1001))).toMatch(/characters/);
  });

  it("accepts a normal file with or without a note", () => {
    expect(validateDealFileUpload({ size: 1000 }, "")).toBeNull();
    expect(validateDealFileUpload({ size: 1000 }, "Corrected the mortgagee clause")).toBeNull();
  });
});

describe("audit trail", () => {
  it("weaves status changes and uploads into one list, newest first", () => {
    const events = [{ id: "e1", createdAt: at("2026-10-06T10:00:00Z") }, { id: "e2", createdAt: at("2026-10-12T10:00:00Z") }];
    const files = [{ id: "f1", createdAt: at("2026-10-09T10:00:00Z") }, { id: "f2", createdAt: at("2026-10-14T10:00:00Z") }];
    const trail = mergeAuditTrail(events, files).map((t) => (t.kind === "event" ? t.event.id : t.file.id));
    expect(trail).toEqual(["f2", "e2", "f1", "e1"]);
  });

  it("numbers revisions oldest first", () => {
    const files = [{ id: "new", createdAt: at("2026-10-14T00:00:00Z") }, { id: "old", createdAt: at("2026-10-09T00:00:00Z") }];
    const labels = versionLabels(files);
    expect(labels.get("old")).toBe("v1");
    expect(labels.get("new")).toBe("v2");
  });
});

describe("validateDealFileBatch", () => {
  const f = (name: string, size = 1000) => ({ name, size });

  it("accepts several ordinary files", () => {
    expect(validateDealFileBatch([f("a.pdf"), f("b.pdf"), f("c.pdf")], "")).toBeNull();
  });

  it("needs at least one file", () => {
    expect(validateDealFileBatch([], "")).toMatch(/Choose a file/);
  });

  it("names the file that is empty or too big", () => {
    expect(validateDealFileBatch([f("a.pdf"), f("empty.pdf", 0)], "")).toMatch(/empty\.pdf is empty/);
    expect(validateDealFileBatch([f("a.pdf"), f("huge.pdf", DEAL_FILE_MAX_BYTES + 1)], "")).toMatch(/huge\.pdf is over 15MB/);
  });

  it("limits how many files and how much in one save", () => {
    const many = Array.from({ length: DEAL_FILE_MAX_COUNT + 1 }, (_, i) => f(`${i}.pdf`));
    expect(validateDealFileBatch(many, "")).toMatch(/up to 10/);
    const big = [f("1.pdf", 14 * 1024 * 1024), f("2.pdf", 14 * 1024 * 1024), f("3.pdf", 14 * 1024 * 1024), f("4.pdf", 14 * 1024 * 1024)];
    expect(validateDealFileBatch(big, "")).toMatch(/50MB/);
  });

  it("checks the shared note length", () => {
    expect(validateDealFileBatch([f("a.pdf")], "x".repeat(1001))).toMatch(/characters/);
  });
});
