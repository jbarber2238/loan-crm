import { describe, expect, it } from "vitest";
import { batchFiles } from "@/lib/zip-uploads";

const file = (name: string, bytes: number) => new File([new Uint8Array(bytes)], name);
const MB = 1024 * 1024;

describe("batchFiles", () => {
  it("keeps small files together up to the count limit", () => {
    const files = Array.from({ length: 10 }, (_, i) => file(`${i}.pdf`, 1000));
    expect(batchFiles(files).map((b) => b.length)).toEqual([8, 2]);
  });

  it("sends big files in separate calls so the server never holds too many at once", () => {
    const files = [file("a.pdf", 25 * MB), file("b.pdf", 25 * MB), file("c.pdf", 5 * MB)];
    expect(batchFiles(files).map((b) => b.map((f) => f.name))).toEqual([["a.pdf"], ["b.pdf", "c.pdf"]]);
  });

  it("still sends one file that is bigger than the byte limit", () => {
    expect(batchFiles([file("huge.pdf", 30 * MB)], 8, 10 * MB)).toHaveLength(1);
  });

  it("returns nothing for no files", () => {
    expect(batchFiles([])).toEqual([]);
  });
});
