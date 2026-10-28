import type { ReactNode } from "react";

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/gi;
// Punctuation that usually ends a sentence rather than the link ("see https://example.com/page.").
const TRAILING = /[.,;:!?)\]}]+$/;

/** Splits text into plain strings and clickable links (http and https only). */
export function linkify(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const url = match[0].replace(TRAILING, "");
    if (start > last) out.push(text.slice(last, start));
    out.push(
      <a
        key={`${start}-${url}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium underline underline-offset-2 break-all hover:opacity-80"
      >
        {url}
      </a>
    );
    last = start + url.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export interface VideoEmbed {
  provider: "Loom" | "YouTube" | "Vimeo";
  src: string;
  /** The page people open if the player won't load. */
  href: string;
}

/** The first Loom, YouTube or Vimeo link in the text, as something that can be played in place. */
export function findVideoEmbed(text: string): VideoEmbed | null {
  for (const match of text.matchAll(URL_PATTERN)) {
    const raw = match[0].replace(TRAILING, "");
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      continue;
    }
    const host = url.hostname.replace(/^www\./, "");
    const loom = host === "loom.com" && url.pathname.match(/^\/(?:share|embed)\/([a-z0-9]+)/i);
    if (loom) return { provider: "Loom", src: `https://www.loom.com/embed/${loom[1]}`, href: raw };
    const youtubeId =
      host === "youtu.be"
        ? url.pathname.slice(1).split("/")[0]
        : host === "youtube.com" || host === "m.youtube.com"
          ? (url.searchParams.get("v") ?? url.pathname.match(/^\/(?:embed|shorts)\/([\w-]+)/)?.[1])
          : null;
    if (youtubeId && /^[\w-]{6,}$/.test(youtubeId)) {
      return { provider: "YouTube", src: `https://www.youtube.com/embed/${youtubeId}`, href: raw };
    }
    const vimeo = host === "vimeo.com" && url.pathname.match(/^\/(\d+)/);
    if (vimeo) return { provider: "Vimeo", src: `https://player.vimeo.com/video/${vimeo[1]}`, href: raw };
  }
  return null;
}
