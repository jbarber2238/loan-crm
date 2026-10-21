import { describe, expect, it } from "vitest";
import { DEAL_FILE_MAX_BYTES, mergeAuditTrail, validateDealFileUpload, versionLabels } from "@/lib/deal-files";

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
