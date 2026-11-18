// Notes stay plain text in the database. A small, safe set of marks gives them structure, so everything that reads a
// note (the Notes tab, the Latest update banner, the end-of-day section parser, the Claude connector) keeps working:
//
//   **bold**   _italic_   ++underline++   ~~strikethrough~~   [text](https://link)
//   "• item" / "- item"          bullet (two spaces of indent per level: "  • sub-item")
//   "1. item"                    numbered (same indent rule)
//   "> text"                     quote
//
// Old notes already use "• " bullets, so they read the same as before. Nothing here produces HTML: the renderer and
// the editor build elements from these pieces, so typed or pasted markup is just words.

export type InlineNode =
  | { type: "text"; text: string }
  | { type: "bold" | "italic" | "underline" | "strike"; children: InlineNode[] }
  | { type: "link"; href: string; children: InlineNode[] };

const MARKERS: { marker: string; type: "bold" | "italic" | "underline" | "strike" }[] = [
  { marker: "**", type: "bold" },
  { marker: "~~", type: "strike" },
  { marker: "++", type: "underline" },
  { marker: "_", type: "italic" },
];

const LINK = /^\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/;
const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c);
const isWord = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}_]/u.test(c);

function findCloser(s: string, marker: string, from: number): number {
  for (let j = s.indexOf(marker, from); j !== -1; j = s.indexOf(marker, j + 1)) {
    if (j <= from) continue; // needs at least one character inside
    if (isSpace(s[j - 1])) continue;
    // Underscores inside words (file_name_here) are never italics.
    if (marker === "_" && isWord(s[j + 1])) continue;
    return j;
  }
  return -1;
}

export function parseInlineTree(s: string): InlineNode[] {
  const out: InlineNode[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push({ type: "text", text: buf });
    buf = "";
  };
  let i = 0;
  outer: while (i < s.length) {
    if (s[i] === "[") {
      const m = LINK.exec(s.slice(i));
      if (m) {
        flush();
        out.push({ type: "link", href: m[2], children: parseInlineTree(m[1]) });
        i += m[0].length;
        continue;
      }
    }
    for (const { marker, type } of MARKERS) {
      if (!s.startsWith(marker, i)) continue;
      const next = s[i + marker.length];
      if (isSpace(next) || next === marker[0]) continue;
      if (marker === "_" && isWord(s[i - 1])) continue;
      const j = findCloser(s, marker, i + marker.length);
      if (j === -1) continue;
      flush();
      out.push({ type, children: parseInlineTree(s.slice(i + marker.length, j)) });
      i = j + marker.length;
      continue outer;
    }
    buf += s[i];
    i += 1;
  }
  flush();
  return out;
}

/** The words of one line with its marks, list prefix and quote sign removed, for one-line previews. */
export function notePlainText(line: string): string {
  const flat = (nodes: InlineNode[]): string => nodes.map((n) => (n.type === "text" ? n.text : flat(n.children))).join("");
  return flat(parseInlineTree(line.replace(/^\s*(?:>\s?|[•\-*]\s+|\d{1,3}[.)]\s+)/, ""))).trim();
}

/** Turns what a person typed in the link box into something safe to link to, or null when it isn't a link. */
export function normalizeLinkUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t || /\s/.test(t)) return null;
  if (/^(https?:\/\/|mailto:)\S+$/i.test(t)) return t;
  if (/^[^\s@/:]+@[^\s@/:]+\.[^\s@/:]+$/.test(t)) return `mailto:${t}`;
  if (/^[^\s/:]+\.[^\s/:]{2,}(?:[/?#]\S*)?$/.test(t)) return `https://${t}`;
  return null;
}

// ---- Lines and blocks ----

export type ListNode = { ordered: boolean; start: number; items: { text: string; children: ListNode[] }[] };

export type Segment =
  | { kind: "line"; text: string }
  | { kind: "quote"; lines: string[] }
  | { kind: "list"; lists: ListNode[] };

type ListLine = { depth: number; ordered: boolean; number: number; text: string };
const LIST_LINE = /^( *)(?:([•\-*])|(\d{1,3})[.)])\s+(.*)$/;
const QUOTE_LINE = /^>\s?(.*)$/;

function parseListLine(raw: string): ListLine | null {
  const m = LIST_LINE.exec(raw.replace(/^\t+/, (t) => "  ".repeat(t.length)));
  if (!m) return null;
  return { depth: Math.floor(m[1].length / 2), ordered: m[3] !== undefined, number: m[3] ? Number(m[3]) : 1, text: m[4] };
}

/** Builds nested lists from consecutive list lines. A new kind of list at the same level starts a new list. */
export function buildLists(lines: ListLine[]): ListNode[] {
  const roots: ListNode[] = [];
  // Open list per depth, outermost first.
  const stack: { list: ListNode; depth: number }[] = [];
  let prevDepth = -1;
  for (const line of lines) {
    const depth = Math.min(line.depth, prevDepth + 1); // can't be deeper than one level inside the line above
    prevDepth = depth;
    while (stack.length && stack[stack.length - 1].depth > depth) stack.pop();
    let top = stack[stack.length - 1];
    if (!top || top.depth < depth || top.list.ordered !== line.ordered) {
      const list: ListNode = { ordered: line.ordered, start: line.number, items: [] };
      if (top && top.depth < depth) {
        const parent = top.list.items[top.list.items.length - 1];
        parent.children.push(list);
      } else {
        if (top) stack.pop();
        const above = stack[stack.length - 1];
        if (above) above.list.items[above.list.items.length - 1].children.push(list);
        else roots.push(list);
      }
      top = { list, depth };
      stack.push(top);
    }
    top.list.items.push({ text: line.text, children: [] });
  }
  return roots;
}

/** Every line kept, including blank ones, with list lines grouped into nested lists and "> " lines into quotes. */
export function segmentNote(body: string): Segment[] {
  const segments: Segment[] = [];
  let listLines: ListLine[] = [];
  const flushList = () => {
    if (listLines.length) segments.push({ kind: "list", lists: buildLists(listLines) });
    listLines = [];
  };
  for (const raw of body.replace(/\r\n/g, "\n").split("\n")) {
    const item = parseListLine(raw);
    if (item) {
      listLines.push(item);
      continue;
    }
    flushList();
    const quote = QUOTE_LINE.exec(raw);
    if (quote) {
      const prev = segments[segments.length - 1];
      if (prev?.kind === "quote") prev.lines.push(quote[1]);
      else segments.push({ kind: "quote", lines: [quote[1]] });
    } else {
      segments.push({ kind: "line", text: raw });
    }
  }
  flushList();
  return segments;
}

export type NoteBlock = { kind: "text"; text: string } | { kind: "quote"; lines: string[] } | { kind: "list"; lists: ListNode[] };

/** For showing a note: text runs keep their line breaks; blank lines only separate blocks. */
export function parseNoteBlocks(body: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  let text: string[] = [];
  const flushText = () => {
    const joined = text.join("\n").replace(/^\n+|\n+$/g, "");
    if (joined) blocks.push({ kind: "text", text: joined });
    text = [];
  };
  for (const seg of segmentNote(body)) {
    if (seg.kind === "line") {
      text.push(seg.text);
      continue;
    }
    flushText();
    blocks.push(seg);
  }
  flushText();
  return blocks;
}
