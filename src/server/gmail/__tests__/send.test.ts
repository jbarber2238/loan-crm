import { describe, expect, it } from "vitest";
import { encodeMessage, encodeBodyBase64 } from "../encode";

function decodeRaw(raw: string): string {
  return Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

describe("email encoding", () => {
  it("sends the body as base64 so emoji and curly quotes survive", () => {
    const body = "<h2>It’s closed! 🎉</h2>";
    const mime = decodeRaw(encodeMessage({ from: "a@b.com", to: "c@d.com", subject: "Hi", body, html: true }));
    expect(mime).toContain("Content-Transfer-Encoding: base64");
    expect(mime).not.toContain("🎉");
    const encodedPart = mime.split("\r\n\r\n")[1];
    expect(Buffer.from(encodedPart.replace(/\r\n/g, ""), "base64").toString("utf-8")).toBe(body);
  });

  it("wraps encoded lines at 76 characters", () => {
    const lines = encodeBodyBase64("x".repeat(500)).split("\r\n");
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => l.length <= 76)).toBe(true);
  });

  it("also encodes the body part of a message with attachments", () => {
    const mime = decodeRaw(
      encodeMessage({
        from: "a@b.com",
        to: "c@d.com",
        subject: "Hi",
        body: "🎉",
        html: true,
        attachments: [{ fileName: "a.txt", mimeType: "text/plain", data: Buffer.from("hi").toString("base64") }],
      })
    );
    expect(mime).not.toContain("🎉");
    expect(mime.match(/Content-Transfer-Encoding: base64/g)?.length).toBe(2);
  });
});
