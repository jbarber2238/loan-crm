import { describe, expect, it } from "vitest";
import { inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { addSignaturePage } from "@/server/pdf/signature-page";

async function samplePdf(pages: number) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage([612, 792]).drawText(`Letter page ${i + 1}`, { x: 72, y: 700, size: 14 });
  return pdf.save();
}

describe("addSignaturePage", () => {
  it("adds exactly one page after the uploaded document and keeps the original pages", async () => {
    const out = await PDFDocument.load(await addSignaturePage(await samplePdf(2), "Letter of Explanation"));
    expect(out.getPageCount()).toBe(3);
  });

  it("carries the PandaDoc signature and date field tags as text on the new page", async () => {
    // Page content is deflated and the text hex-encoded; inflate every stream and look for the tags the way a text extractor would.
    const raw = Buffer.from(await addSignaturePage(await samplePdf(1), "Letter of Explanation"));
    const text = [...raw.toString("latin1").matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
      .map((m) => {
        const body = Buffer.from(m[1], "latin1");
        try {
          return inflateSync(body).toString("latin1");
        } catch {
          return body.toString("latin1");
        }
      })
      .join("\n");
    const hex = (t: string) => Buffer.from(t, "latin1").toString("hex").toUpperCase();
    const has = (t: string) => text.includes(t) || text.toUpperCase().includes(hex(t));
    expect(has("{signature:Client_______}")).toBe(true);
    expect(has("{date:Client}")).toBe(true);
  });

  it("matches the size of the last page", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([612, 792]);
    pdf.addPage([595, 842]);
    const out = await PDFDocument.load(await addSignaturePage(await pdf.save(), "Doc"));
    expect(out.getPage(2).getSize()).toEqual({ width: 595, height: 842 });
  });

  it("still works when the document name has characters the PDF font can't draw", async () => {
    const out = await PDFDocument.load(await addSignaturePage(await samplePdf(1), "Letter — “Explanation”"));
    expect(out.getPageCount()).toBe(2);
  });

  it("rejects something that isn't a PDF", async () => {
    await expect(addSignaturePage(new TextEncoder().encode("not a pdf"), "x")).rejects.toThrow();
  });
});
