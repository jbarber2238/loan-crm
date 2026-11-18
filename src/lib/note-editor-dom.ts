// Moves a note between its stored plain text and the live editor.
//   stored:  "Call **Tom**\n• one\n• two\n\n1. first"
//   editor:  a line per <div>, <strong> for bold, real <ul>/<ol> lists.
// Blank lines are kept exactly, so end-of-day updates keep the spacing their section headings rely on.
// Nothing is ever read back as HTML: the editor's DOM is turned into text, and text is turned into DOM with
// createElement/textContent, so a pasted or typed "<script>" is just words.

import { parseInline } from "./note-format";

const BULLET = /^\s*[•\-*]\s+(.*)$/;
const NUMBER = /^\s*\d{1,3}[.)]\s+(.*)$/;

function appendInline(doc: Document, parent: Node, line: string) {
  for (const part of parseInline(line)) {
    if (part.bold) {
      const strong = doc.createElement("strong");
      strong.textContent = part.text;
      parent.appendChild(strong);
    } else {
      parent.appendChild(doc.createTextNode(part.text));
    }
  }
}

/** Fills the editor element with the note's text. */
export function renderNoteInto(root: HTMLElement, text: string) {
  const doc = root.ownerDocument;
  root.replaceChildren();
  let list: HTMLElement | null = null;
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const bullet = BULLET.exec(line);
    const number = bullet ? null : NUMBER.exec(line);
    const kind = bullet ? "UL" : number ? "OL" : null;
    if (kind) {
      if (!list || list.tagName !== kind) {
        list = doc.createElement(kind.toLowerCase());
        root.appendChild(list);
      }
      const li = doc.createElement("li");
      appendInline(doc, li, (bullet ?? number)![1]);
      list.appendChild(li);
      continue;
    }
    list = null;
    const div = doc.createElement("div");
    if (line) appendInline(doc, div, line);
    else div.appendChild(doc.createElement("br"));
    root.appendChild(div);
  }
}

const BLOCK_TAGS = new Set(["DIV", "P", "UL", "OL", "LI"]);

function inlineText(node: Node, inBold: boolean): string {
  if (node.nodeType === 3) return (node.textContent ?? "").replace(/ /g, " ").replace(/[\r\n]+/g, " ");
  if (node.nodeType !== 1) return "";
  const el = node as HTMLElement;
  if (el.tagName === "BR") return "\n";
  const isBold = el.tagName === "B" || el.tagName === "STRONG" || /^(bold|[6-9]00)$/.test(el.style?.fontWeight ?? "");
  const inner = Array.from(el.childNodes)
    .map((c) => inlineText(c, inBold || isBold))
    .join("");
  if (!isBold || inBold) return inner;
  // Marks sit tight against the words; spaces the selection grabbed stay outside them.
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner)!;
  return m[2] ? `${m[1]}**${m[2]}**${m[3]}` : inner;
}

function collectLines(parent: Node, lines: string[]) {
  let run: Node[] = [];
  const flush = () => {
    if (run.length) {
      const text = run.map((n) => inlineText(n, false)).join("");
      for (const l of text.split("\n")) lines.push(l);
      run = [];
    }
  };
  for (const child of Array.from(parent.childNodes)) {
    const tag = child.nodeType === 1 ? (child as HTMLElement).tagName : "";
    if (tag === "UL" || tag === "OL") {
      flush();
      let n = 0;
      for (const li of Array.from(child.childNodes)) {
        if (li.nodeType !== 1 || (li as HTMLElement).tagName !== "LI") continue;
        n += 1;
        const text = inlineText(li, false).replace(/\n+$/g, "").replace(/\n/g, " ").trim();
        lines.push(tag === "UL" ? `• ${text}` : `${n}. ${text}`);
      }
    } else if (tag === "DIV" || tag === "P") {
      flush();
      const hasBlocks = Array.from(child.childNodes).some((c) => c.nodeType === 1 && BLOCK_TAGS.has((c as HTMLElement).tagName));
      if (hasBlocks) collectLines(child, lines);
      else {
        const text = inlineText(child, false);
        // A lone <br> is an empty line, not two.
        for (const l of (text === "\n" ? "" : text).split("\n")) lines.push(l);
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
  collectLines(root, lines);
  // Browsers leave a stray empty line when the editor is cleared.
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}
