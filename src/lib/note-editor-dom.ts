// Moves a note between its stored plain text and the live editor (see note-format.ts for the marks).
//   stored:  "Call **Tom**\n• one\n  • sub-point\n> a quote\n\n1. first"
//   editor:  a line per <div>, <strong>/<em>/<u>/<s>/<a> for the marks, real nested <ul>/<ol>, <blockquote> for quotes.
// Blank lines are kept exactly, so end-of-day updates keep the spacing their section headings rely on.
// Nothing is ever read back as HTML: the editor's DOM is turned into text, and text is turned into DOM with
// createElement/textContent, so a pasted or typed "<script>" is just words.

import { normalizeLinkUrl, parseInlineTree, segmentNote, type InlineNode, type ListNode } from "./note-format";

const TAG: Record<"bold" | "italic" | "underline" | "strike", string> = { bold: "strong", italic: "em", underline: "u", strike: "s" };

function appendInline(doc: Document, parent: Node, nodes: InlineNode[]) {
  for (const n of nodes) {
    if (n.type === "text") {
      parent.appendChild(doc.createTextNode(n.text));
    } else if (n.type === "link") {
      const a = doc.createElement("a");
      a.setAttribute("href", n.href);
      a.setAttribute("rel", "noopener noreferrer");
      appendInline(doc, a, n.children);
      parent.appendChild(a);
    } else {
      const el = doc.createElement(TAG[n.type]);
      appendInline(doc, el, n.children);
      parent.appendChild(el);
    }
  }
}

function appendList(doc: Document, parent: Node, list: ListNode) {
  const el = doc.createElement(list.ordered ? "ol" : "ul");
  if (list.ordered && list.start !== 1) el.setAttribute("start", String(list.start));
  for (const item of list.items) {
    const li = doc.createElement("li");
    appendInline(doc, li, parseInlineTree(item.text));
    for (const child of item.children) appendList(doc, li, child);
    el.appendChild(li);
  }
  parent.appendChild(el);
}

function lineDiv(doc: Document, text: string): HTMLElement {
  const div = doc.createElement("div");
  if (text) appendInline(doc, div, parseInlineTree(text));
  else div.appendChild(doc.createElement("br"));
  return div;
}

/** Fills the editor element with the note's text. */
export function renderNoteInto(root: HTMLElement, text: string) {
  const doc = root.ownerDocument;
  root.replaceChildren();
  for (const seg of segmentNote(text)) {
    if (seg.kind === "line") {
      root.appendChild(lineDiv(doc, seg.text));
    } else if (seg.kind === "quote") {
      const q = doc.createElement("blockquote");
      for (const line of seg.lines) q.appendChild(lineDiv(doc, line));
      root.appendChild(q);
    } else {
      for (const list of seg.lists) appendList(doc, root, list);
    }
  }
}

// ---- Editor → text ----

const LIST_TAGS = new Set(["UL", "OL"]);
const BLOCK_TAGS = new Set(["DIV", "P", "UL", "OL", "LI", "BLOCKQUOTE"]);

function wrap(marker: string, inner: string): string {
  // Marks sit tight against the words; spaces the selection grabbed stay outside them.
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner)!;
  return m[2] ? `${m[1]}${marker}${m[2]}${marker}${m[3]}` : inner;
}

type Flags = { bold: boolean; italic: boolean; underline: boolean; strike: boolean };

function inlineText(node: Node, on: Flags): string {
  if (node.nodeType === 3) return (node.textContent ?? "").replace(/ /g, " ").replace(/[\r\n]+/g, " ");
  if (node.nodeType !== 1) return "";
  const el = node as HTMLElement;
  const tag = el.tagName;
  if (tag === "BR") return "\n";
  const style = el.style;
  const is = {
    bold: tag === "B" || tag === "STRONG" || /^(bold|[6-9]00)$/.test(style?.fontWeight ?? ""),
    italic: tag === "I" || tag === "EM" || style?.fontStyle === "italic",
    underline: tag === "U" || /underline/.test(style?.textDecorationLine || style?.textDecoration || ""),
    strike: tag === "S" || tag === "STRIKE" || tag === "DEL" || /line-through/.test(style?.textDecorationLine || style?.textDecoration || ""),
  };
  // A mark already open further out isn't repeated.
  const next: Flags = { bold: on.bold || is.bold, italic: on.italic || is.italic, underline: on.underline || is.underline, strike: on.strike || is.strike };
  let out = Array.from(el.childNodes)
    .map((c) => inlineText(c, next))
    .join("");
  if (tag === "A") {
    const href = el.getAttribute("href") ?? "";
    const safe = normalizeLinkUrl(href);
    if (safe && /^(https?:|mailto:)/i.test(safe) && out.trim()) out = `[${out.trim()}](${safe})`;
  }
  if (is.strike && !on.strike) out = wrap("~~", out);
  if (is.underline && !on.underline) out = wrap("++", out);
  if (is.italic && !on.italic) out = wrap("_", out);
  if (is.bold && !on.bold) out = wrap("**", out);
  return out;
}

const NONE: Flags = { bold: false, italic: false, underline: false, strike: false };

function childLists(el: Element): Element[] {
  return Array.from(el.children).filter((c) => LIST_TAGS.has(c.tagName));
}

function listLines(list: Element, depth: number, lines: string[]) {
  let n = Number((list as HTMLOListElement).getAttribute("start")) || 1;
  const ordered = list.tagName === "OL";
  for (const child of Array.from(list.childNodes)) {
    if (child.nodeType !== 1) continue;
    const el = child as HTMLElement;
    if (LIST_TAGS.has(el.tagName)) {
      // Browsers sometimes nest a sub-list straight inside the list instead of inside an item.
      listLines(el, depth + 1, lines);
      continue;
    }
    if (el.tagName !== "LI") continue;
    // The item's own words are everything except its sub-lists.
    const own = Array.from(el.childNodes)
      .filter((c) => !(c.nodeType === 1 && LIST_TAGS.has((c as Element).tagName)))
      .map((c) => inlineText(c, NONE))
      .join("")
      .replace(/\n+$/g, "")
      .replace(/\n/g, " ")
      .trim();
    lines.push(`${"  ".repeat(depth)}${ordered ? `${n}. ` : "• "}${own}`);
    n += 1;
    for (const sub of childLists(el)) listLines(sub, depth + 1, lines);
  }
}

function collectLines(parent: Node, lines: string[], quote: boolean) {
  const emit = (text: string) => lines.push(quote ? `> ${text}`.replace(/\s+$/, "") : text);
  let run: Node[] = [];
  const flush = () => {
    if (run.length) {
      const text = run.map((n) => inlineText(n, NONE)).join("");
      for (const l of text.split("\n")) emit(l);
      run = [];
    }
  };
  for (const child of Array.from(parent.childNodes)) {
    const tag = child.nodeType === 1 ? (child as HTMLElement).tagName : "";
    if (LIST_TAGS.has(tag)) {
      flush();
      const before = lines.length;
      listLines(child as Element, 0, lines);
      if (quote) for (let i = before; i < lines.length; i++) lines[i] = `> ${lines[i]}`;
    } else if (tag === "BLOCKQUOTE") {
      flush();
      collectLines(child, lines, true);
    } else if (tag === "DIV" || tag === "P") {
      flush();
      const hasBlocks = Array.from(child.childNodes).some((c) => c.nodeType === 1 && BLOCK_TAGS.has((c as HTMLElement).tagName));
      if (hasBlocks) collectLines(child, lines, quote);
      else {
        const text = inlineText(child, NONE);
        // A lone <br> is an empty line, not two.
        for (const l of (text === "\n" ? "" : text).split("\n")) emit(l);
      }
    } else {
      run.push(child);
    }
  }
  flush();
}

/** Reads the editor back into the note's stored text. */
export function readNoteFrom(root: HTMLElement): string {
  const lines: string[] = [];
  collectLines(root, lines, false);
  // Browsers leave a stray empty line when the editor is cleared.
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}
