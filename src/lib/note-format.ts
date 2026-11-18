// Notes stay plain text in the database. A small, safe set of marks gives them structure:
//   **bold**, "• " or "- " bullets, "1. " numbered lines.
// Old notes already use "• " bullets, so they read the same as before. Nothing here produces HTML:
// the renderer builds React elements from these blocks.

export type InlinePart = { text: string; bold: boolean };

export type NoteBlock =
  | { kind: "text"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[]; start: number };

const BULLET = /^(\s*)([•\-*])\s+(.*)$/;
const NUMBER = /^(\s*)(\d{1,3})[.)]\s+(.*)$/;
const BOLD = /\*\*([^*\n]*[^*\s\n][^*\n]*?)\*\*/g;

export function parseInline(line: string): InlinePart[] {
  const parts: InlinePart[] = [];
  let last = 0;
  for (const m of line.matchAll(BOLD)) {
    const inner = m[1];
    if (inner !== inner.trim()) continue; // "** not bold **" stays as typed
    if (m.index > last) parts.push({ text: line.slice(last, m.index), bold: false });
    parts.push({ text: inner, bold: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) parts.push({ text: line.slice(last), bold: false });
  return parts.length ? parts : [{ text: line, bold: false }];
}

/** Groups a note's lines into text runs and bullet / numbered lists. Text runs keep their line breaks. */
export function parseNoteBlocks(body: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  let text: string[] = [];

  function flushText() {
    const joined = text.join("\n").replace(/^\n+|\n+$/g, "");
    if (joined) blocks.push({ kind: "text", text: joined });
    text = [];
  }

  for (const line of body.replace(/\r\n/g, "\n").split("\n")) {
    const bullet = BULLET.exec(line);
    const number = bullet ? null : NUMBER.exec(line);
    if (bullet) {
      flushText();
      const prev = blocks[blocks.length - 1];
      if (prev?.kind === "ul") prev.items.push(bullet[3]);
      else blocks.push({ kind: "ul", items: [bullet[3]] });
    } else if (number) {
      flushText();
      const prev = blocks[blocks.length - 1];
      if (prev?.kind === "ol") prev.items.push(number[3]);
      else blocks.push({ kind: "ol", items: [number[3]], start: Number(number[2]) });
    } else if (!line.trim() && (blocks[blocks.length - 1]?.kind === "ul" || blocks[blocks.length - 1]?.kind === "ol") && text.length === 0) {
      // A blank line right after a list only separates it from what follows.
      continue;
    } else {
      text.push(line);
    }
  }
  flushText();
  return blocks;
}
