import { describe, expect, it } from "vitest";
import { EMOJI_GROUPS, insertAtSelection, withRecentEmoji } from "@/lib/chat-emoji";
import { gifInMessage, isGifUrl } from "@/lib/chat-gif";

describe("insertAtSelection", () => {
  it("types the emoji where the cursor is and moves the cursor past it", () => {
    expect(insertAtSelection("hello world", 5, 5, "😀")).toEqual({ text: "hello😀 world", cursor: 7 });
  });

  it("replaces selected text", () => {
    expect(insertAtSelection("hello world", 6, 11, "🎉")).toEqual({ text: "hello 🎉", cursor: 8 });
  });

  it("clamps a cursor that is past the end", () => {
    expect(insertAtSelection("hi", 99, 99, "👍")).toEqual({ text: "hi👍", cursor: 4 });
  });
});

describe("withRecentEmoji", () => {
  it("puts the newest first and drops the repeat", () => {
    expect(withRecentEmoji(["😀", "🎉", "👍"], "🎉")).toEqual(["🎉", "😀", "👍"]);
  });

  it("keeps at most 12", () => {
    const many = Array.from({ length: 12 }, (_, i) => String(i));
    expect(withRecentEmoji(many, "x")).toHaveLength(12);
    expect(withRecentEmoji(many, "x")[0]).toBe("x");
  });
});

describe("emoji groups", () => {
  it("has no empty groups and no repeats inside a group", () => {
    for (const g of EMOJI_GROUPS) {
      expect(g.emojis.length).toBeGreaterThan(0);
      expect(new Set(g.emojis).size).toBe(g.emojis.length);
    }
  });
});

describe("GIF addresses", () => {
  it("accepts Giphy image links", () => {
    expect(isGifUrl("https://media2.giphy.com/media/abc123/giphy.gif")).toBe(true);
    expect(isGifUrl("https://i.giphy.com/media/abc123/200.webp")).toBe(true);
  });

  it("rejects other hosts, plain http and look-alike domains", () => {
    expect(isGifUrl("https://example.com/cat.gif")).toBe(false);
    expect(isGifUrl("http://media.giphy.com/media/abc/giphy.gif")).toBe(false);
    expect(isGifUrl("https://media.giphy.com.evil.com/media/abc/giphy.gif")).toBe(false);
    expect(isGifUrl("https://giphy.com/gifs/funny-abc123")).toBe(false);
    expect(isGifUrl("not a url")).toBe(false);
  });

  it("treats a message as a GIF only when the whole message is the address", () => {
    expect(gifInMessage("  https://media0.giphy.com/media/abc/giphy.gif \n")).toBe("https://media0.giphy.com/media/abc/giphy.gif");
    expect(gifInMessage("look https://media0.giphy.com/media/abc/giphy.gif")).toBeNull();
    expect(gifInMessage("")).toBeNull();
  });
});
