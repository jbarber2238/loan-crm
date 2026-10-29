// GIFs in team chat. A GIF is sent as an ordinary message whose text is the GIF's address, and the chat shows
// it as a picture. Only Giphy's own image hosts count, so a pasted link to anywhere else stays a plain link.

const GIPHY_HOST = /^(?:media\d*|i)\.giphy\.com$/i;

/** True for an https address on one of Giphy's image hosts that ends in .gif or .webp. */
export function isGifUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return url.protocol === "https:" && GIPHY_HOST.test(url.hostname) && /\.(?:gif|webp)$/i.test(url.pathname);
}

/** The GIF a message carries: its entire text is one GIF address. Null for anything else. */
export function gifInMessage(body: string): string | null {
  const text = body.trim();
  return text && !/\s/.test(text) && isGifUrl(text) ? text : null;
}
