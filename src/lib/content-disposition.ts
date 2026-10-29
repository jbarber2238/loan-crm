// The Content-Disposition header for serving an uploaded file under its own name. File names come from
// people's computers: a Mac screenshot is "Screenshot 2026-10-29 at 11.03.27<U+202F>AM.png", and a header can't
// carry characters outside Latin-1, so passing the raw name made the response throw (a 500, no image).
// Sends a plain-ASCII fallback plus the real name in the RFC 5987 form that browsers understand.

export function contentDisposition(type: "inline" | "attachment", fileName: string): string {
  const spaced = fileName.replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000]/g, " ").replace(/[\r\n]/g, " ");
  const ascii = spaced.replace(/["\\]/g, "").replace(/[^\x20-\x7e]/g, "_").trim() || "file";
  const encoded = encodeURIComponent(spaced.trim() || "file").replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
