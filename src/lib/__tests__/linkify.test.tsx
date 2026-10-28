import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import { findVideoEmbed, linkify } from "@/lib/linkify";

describe("linkify", () => {
  it("turns a link into a clickable anchor and keeps the words around it", () => {
    const parts = linkify("Watch this https://www.loom.com/share/abc123 then reply");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("Watch this ");
    const link = parts[1];
    expect(isValidElement(link)).toBe(true);
    expect((link as { props: { href: string; target: string; rel: string } }).props).toMatchObject({
      href: "https://www.loom.com/share/abc123",
      target: "_blank",
      rel: "noopener noreferrer",
    });
    expect(parts[2]).toBe(" then reply");
  });

  it("leaves sentence punctuation outside the link", () => {
    const [, link, tail] = linkify("See https://example.com/page.");
    expect((link as { props: { href: string } }).props.href).toBe("https://example.com/page");
    expect(tail).toBe(".");
  });

  it("returns plain text untouched, and ignores non-web schemes", () => {
    expect(linkify("no links here")).toEqual(["no links here"]);
    expect(linkify("javascript:alert(1) and ftp://x.y")).toEqual(["javascript:alert(1) and ftp://x.y"]);
  });
});

describe("findVideoEmbed", () => {
  it("finds a Loom share link", () => {
    expect(findVideoEmbed("https://www.loom.com/share/e1b40c600ca24a96a2a32608e29ba667")).toMatchObject({
      provider: "Loom",
      src: "https://www.loom.com/embed/e1b40c600ca24a96a2a32608e29ba667",
    });
  });

  it("finds YouTube watch, short and youtu.be links", () => {
    expect(findVideoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.src).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(findVideoEmbed("https://youtu.be/dQw4w9WgXcQ?t=5")?.src).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(findVideoEmbed("https://www.youtube.com/shorts/dQw4w9WgXcQ")?.src).toBe("https://www.youtube.com/embed/dQw4w9WgXcQ");
  });

  it("finds a Vimeo link", () => {
    expect(findVideoEmbed("https://vimeo.com/123456789")?.src).toBe("https://player.vimeo.com/video/123456789");
  });

  it("does not embed ordinary links or look-alike hosts", () => {
    expect(findVideoEmbed("https://example.com/loom.com/share/abc")).toBeNull();
    expect(findVideoEmbed("https://notloom.com/share/abc")).toBeNull();
    expect(findVideoEmbed("just text")).toBeNull();
  });
});
