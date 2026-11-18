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

// ---- Editor helpers: pure, take the text and selection, return the new text and selection. ----

export type EditResult = { text: string; start: number; end: number };

export function toggleBold(text: string, start: number, end: number): EditResult {
  const selected = text.slice(start, end);
  // Already wrapped, with the marks just outside the selection.
  if (text.slice(start - 2, start) === "**" && text.slice(end, end + 2) === "**" && start >= 2) {
    return { text: text.slice(0, start - 2) + selected + text.slice(end + 2), start: start - 2, end: end - 2 };
  }
  // Already wrapped, with the marks inside the selection.
  if (selected.length >= 4 && selected.startsWith("**") && selected.endsWith("**")) {
    const inner = selected.slice(2, -2);
    return { text: text.slice(0, start) + inner + text.slice(end), start, end: start + inner.length };
  }
  if (start === end) {
    return { text: `${text.slice(0, start)}****${text.slice(end)}`, start: start + 2, end: start + 2 };
  }
  // Keep the marks tight against the words, outside any spaces the selection grabbed.
  const lead = selected.length - selected.trimStart().length;
  const trail = selected.length - selected.trimEnd().length;
  const core = selected.slice(lead, selected.length - trail);
  if (!core) return { text, start, end };
  const s = start + lead;
  const e = end - trail;
  return { text: `${text.slice(0, s)}**${core}**${text.slice(e)}`, start: s + 2, end: e + 2 };
}

function lineBounds(text: string, start: number, end: number): [number, number] {
  const from = text.lastIndexOf("\n", start - 1) + 1;
  const nl = text.indexOf("\n", end > start ? end - 1 : end);
  return [from, nl === -1 ? text.length : nl];
}

/** Turns the selected lines into a bullet or numbered list, or back into plain lines if they already are one. */
export function toggleList(text: string, start: number, end: number, kind: "ul" | "ol"): EditResult {
  const [from, to] = lineBounds(text, start, end);
  const lines = text.slice(from, to).split("\n");
  const target = kind === "ul" ? BULLET : NUMBER;
  const content = lines.filter((l) => l.trim());
  const allAlready = content.length > 0 && content.every((l) => target.test(l));
  let n = 0;
  const next = lines.map((line) => {
    if (!line.trim()) return line;
    const existing = BULLET.exec(line) ?? NUMBER.exec(line);
    const body = existing ? existing[3] : line.trimStart();
    if (allAlready) return body;
    n += 1;
    return kind === "ul" ? `• ${body}` : `${n}. ${body}`;
  });
  const replaced = next.join("\n");
  return { text: text.slice(0, from) + replaced + text.slice(to), start: from, end: from + replaced.length };
}

/** Enter inside a list line starts the next item; Enter on an empty item ends the list. Null means "do the normal thing". */
export function continueList(text: string, caret: number): EditResult | null {
  const from = text.lastIndexOf("\n", caret - 1) + 1;
  const nl = text.indexOf("\n", caret);
  const to = nl === -1 ? text.length : nl;
  const line = text.slice(from, to);
  const bullet = BULLET.exec(line);
  const number = bullet ? null : NUMBER.exec(line);
  const m = bullet ?? number;
  if (!m) return null;
  // Only when the caret is at the end of the line; mid-line Enter splits the line as usual.
  if (caret !== to) return null;
  if (!m[3].trim()) {
    return { text: text.slice(0, from) + text.slice(to), start: from, end: from };
  }
  const prefix = bullet ? `${m[1]}${m[2]} ` : `${m[1]}${Number(m[2]) + 1}. `;
  const insert = `\n${prefix}`;
  const pos = caret + insert.length;
  return { text: text.slice(0, caret) + insert + text.slice(caret), start: pos, end: pos };
}
