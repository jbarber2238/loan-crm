import { describe, expect, it } from "vitest";
import {
  CHUNK_BYTES,
  INLINE_LIMIT_BYTES,
  STAGED_PREFIX,
  chunkCount,
  isStagedMarker,
  parseStagedMarker,
  stageLargeFiles,
} from "../stage-large-files";

const file = (name: string, bytes: number) => new File([new Uint8Array(bytes)], name, { type: "application/pdf" });

describe("stageLargeFiles", () => {
  it("leaves a small form untouched", async () => {
    const fd = new FormData();
    fd.append("file", file("a.pdf", 1000));
    const calls: FormData[] = [];
    const out = await stageLargeFiles(fd, async (p) => (calls.push(p), { ok: true }));
    expect(out).toBe(fd);
    expect(calls).toHaveLength(0);
  });

  it("sends a big file in pieces and leaves a marker in its place", async () => {
    const size = 7 * 1024 * 1024; // 7MB -> 3 pieces
    const fd = new FormData();
    fd.append("note", "hi");
    fd.append("file", file("appraisal.pdf", size));
    const parts: FormData[] = [];
    const out = await stageLargeFiles(fd, async (p) => (parts.push(p), { ok: true }), { borrowerToken: "tok" });
    expect(parts).toHaveLength(chunkCount(size));
    expect(chunkCount(size)).toBe(3);
    expect(parts.every((p) => (p.get("chunk") as File).size <= CHUNK_BYTES)).toBe(true);
    expect(parts.reduce((n, p) => n + (p.get("chunk") as File).size, 0)).toBe(size);
    expect(parts[0].get("borrowerToken")).toBe("tok");
    expect(new Set(parts.map((p) => p.get("uploadId"))).size).toBe(1);
    expect(out.get("note")).toBe("hi");
    const marker = out.get("file");
    expect(isStagedMarker(marker)).toBe(true);
    const parsed = parseStagedMarker(marker as string)!;
    expect(parsed).toMatchObject({ name: "appraisal.pdf", size, chunks: 3, type: "application/pdf" });
    expect(parsed.id).toHaveLength(64);
  });

  it("keeps tiny files inline when others are staged, and counts several files together", async () => {
    const fd = new FormData();
    fd.append("file", file("one.pdf", 2 * 1024 * 1024));
    fd.append("file", file("two.pdf", 2 * 1024 * 1024));
    fd.append("file", file("tiny.txt", 100));
    const parts: FormData[] = [];
    const out = await stageLargeFiles(fd, async (p) => (parts.push(p), { ok: true }));
    const values = out.getAll("file");
    expect(values.filter(isStagedMarker)).toHaveLength(2); // 4MB together is over the limit, so both big ones go
    expect(values.filter((v) => v instanceof File)).toHaveLength(1);
    expect(INLINE_LIMIT_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });

  it("stops with the server's message when a piece is refused", async () => {
    const fd = new FormData();
    fd.append("file", file("big.pdf", 5 * 1024 * 1024));
    await expect(stageLargeFiles(fd, async () => ({ error: "This upload link isn't valid." }))).rejects.toThrow("isn't valid");
  });

  it("rejects malformed markers", () => {
    expect(parseStagedMarker(STAGED_PREFIX + "{not json")).toBeNull();
    expect(isStagedMarker("plain text")).toBe(false);
  });
});
