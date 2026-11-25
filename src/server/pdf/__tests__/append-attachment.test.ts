import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { appendAttachment, attachmentPageCount } from "@/server/pdf/append-attachment";

async function samplePdf(pages: number, size: [number, number] = [612, 792]) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage(size).drawText(`Page ${i + 1}`, { x: 72, y: 700, size: 14 });
  return pdf.save();
}

// A 1x1 PNG.
const PNG = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64")
);

describe("attachmentPageCount", () => {
  it("counts a PDF's pages and treats an image as one page", async () => {
    expect(await attachmentPageCount(await samplePdf(2), "application/pdf")).toBe(2);
    expect(await attachmentPageCount(PNG, "image/png")).toBe(1);
  });

  it("is 0 for anything that can't be added", async () => {
    expect(await attachmentPageCount(new TextEncoder().encode("not a pdf"), "application/pdf")).toBe(0);
    expect(await attachmentPageCount(new TextEncoder().encode("not a png"), "image/png")).toBe(0);
    expect(await attachmentPageCount(await samplePdf(1), "application/msword")).toBe(0);
  });
});

describe("appendAttachment", () => {
  it("adds a PDF's pages after the original ones, at their own size", async () => {
    const out = await PDFDocument.load(await appendAttachment(await samplePdf(1), await samplePdf(2, [500, 700]), "application/pdf"));
    expect(out.getPageCount()).toBe(3);
    expect(out.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    expect(out.getPage(2).getSize()).toEqual({ width: 500, height: 700 });
  });

  it("gives an image a letter-size page of its own", async () => {
    const out = await PDFDocument.load(await appendAttachment(await samplePdf(1), PNG, "image/png"));
    expect(out.getPageCount()).toBe(2);
    expect(out.getPage(1).getSize()).toEqual({ width: 612, height: 792 });
  });
});
