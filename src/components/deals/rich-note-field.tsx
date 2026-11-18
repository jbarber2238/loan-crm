"use client";

import { useEffect, useRef, useState } from "react";
import { Bold, IndentDecrease, IndentIncrease, Italic, Link2, List, ListOrdered, Quote, Redo2, RemoveFormatting, Strikethrough, Underline, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { normalizeLinkUrl } from "@/lib/note-format";
import { readNoteFrom, renderNoteInto } from "@/lib/note-editor-dom";

type Active = { bold: boolean; italic: boolean; underline: boolean; strike: boolean; ul: boolean; ol: boolean; quote: boolean; link: boolean; inList: boolean };
const IDLE: Active = { bold: false, italic: false, underline: false, strike: false, ul: false, ol: false, quote: false, link: false, inList: false };

function elementAtCaret(): Element | null {
  const node = document.getSelection()?.anchorNode;
  if (!node) return null;
  return node.nodeType === 1 ? (node as Element) : node.parentElement;
}

// Buttons take the click without pulling the cursor out of the note.
function ToolButton({ label, title, on, disabled, onClick, children }: { label: string; title?: string; on?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Button
      type="button"
      size="sm"
      variant={on ? "secondary" : "ghost"}
      title={title ?? label}
      aria-label={label}
      aria-pressed={on ?? undefined}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className="px-2"
    >
      {children}
    </Button>
  );
}

/**
 * A note box with the usual email-editor tools: bold, italic, underline, strikethrough, bullets, numbers, indent
 * (Tab / Shift+Tab inside a list), quote, links, clear formatting, undo and redo. Formatting shows as you type.
 * Underneath, the note is still plain text with light marks (see note-format.ts), so saving, old notes and the
 * AI note tools are unchanged.
 */
export function RichNoteField({
  value,
  onChange,
  textareaRef,
  rows = 4,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Lets the parent focus the box (kept under the old name so callers read the same). */
  textareaRef?: React.RefObject<HTMLDivElement | null>;
  rows?: number;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const own = useRef<HTMLDivElement | null>(null);
  const editor = textareaRef ?? own;
  // What the editor last told the parent. A different `value` means the parent changed it (template, pulled context, cleared after posting).
  const synced = useRef<string | null>(null);
  const [active, setActive] = useState<Active>(IDLE);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkText, setLinkText] = useState("");
  const [linkError, setLinkError] = useState(false);
  const savedRange = useRef<Range | null>(null);
  const empty = value.trim() === "";

  useEffect(() => {
    const el = editor.current;
    if (!el || synced.current === value) return;
    renderNoteInto(el, value);
    synced.current = value;
  }, [value, editor]);

  useEffect(() => {
    if (autoFocus) editor.current?.focus();
  }, [autoFocus, editor]);

  // Keep the toolbar's lit buttons in step with where the cursor is.
  useEffect(() => {
    function refresh() {
      const el = editor.current;
      const sel = document.getSelection();
      if (!el || !sel?.anchorNode || !el.contains(sel.anchorNode)) return;
      const at = elementAtCaret();
      setActive({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        strike: document.queryCommandState("strikeThrough"),
        ul: document.queryCommandState("insertUnorderedList"),
        ol: document.queryCommandState("insertOrderedList"),
        quote: !!at?.closest("blockquote"),
        link: !!at?.closest("a"),
        inList: !!at?.closest("li"),
      });
    }
    document.addEventListener("selectionchange", refresh);
    return () => document.removeEventListener("selectionchange", refresh);
  }, [editor]);

  function emit() {
    const el = editor.current;
    if (!el) return;
    const text = readNoteFrom(el);
    synced.current = text;
    onChange(text);
  }

  function run(command: string, arg?: string) {
    editor.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  }

  function toggleQuote() {
    run("formatBlock", active.quote ? "div" : "blockquote");
  }

  function clearFormatting() {
    editor.current?.focus();
    document.execCommand("removeFormat");
    document.execCommand("unlink");
    emit();
  }

  function startLink() {
    if (active.link) {
      run("unlink");
      return;
    }
    const sel = document.getSelection();
    savedRange.current = sel && sel.rangeCount && editor.current?.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
    setLinkText("");
    setLinkError(false);
    setLinkOpen(true);
  }

  function applyLink() {
    const url = normalizeLinkUrl(linkText);
    if (!url) {
      setLinkError(true);
      return;
    }
    const el = editor.current;
    if (!el) return;
    el.focus();
    const sel = document.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    if (sel && sel.isCollapsed) {
      // Nothing was selected: the address itself becomes the linked text.
      document.execCommand("insertText", false, url);
      const node = sel.anchorNode;
      if (node?.nodeType === 3) sel.setBaseAndExtent(node, sel.anchorOffset - url.length, node, sel.anchorOffset);
    }
    document.execCommand("createLink", false, url);
    setLinkOpen(false);
    emit();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    // Tab and Shift+Tab move a list item in and out, like an email editor. Anywhere else Tab keeps its usual job.
    if (e.key === "Tab" && !e.metaKey && !e.ctrlKey && !e.altKey && elementAtCaret()?.closest("li")) {
      e.preventDefault();
      run(e.shiftKey ? "outdent" : "indent");
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      startLink();
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    // Paste as plain words so nothing from another page's styling comes along.
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
    emit();
  }

  const divider = <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />;
  const icon = "size-4";

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-0.5 rounded-lg border bg-muted/30 p-1" role="toolbar" aria-label="Text formatting">
        <ToolButton label="Undo" title="Undo (Ctrl/⌘ Z)" onClick={() => run("undo")}><Undo2 className={icon} /></ToolButton>
        <ToolButton label="Redo" title="Redo (Ctrl/⌘ Shift Z)" onClick={() => run("redo")}><Redo2 className={icon} /></ToolButton>
        {divider}
        <ToolButton label="Bold" title="Bold (Ctrl/⌘ B)" on={active.bold} onClick={() => run("bold")}><Bold className={icon} /></ToolButton>
        <ToolButton label="Italic" title="Italic (Ctrl/⌘ I)" on={active.italic} onClick={() => run("italic")}><Italic className={icon} /></ToolButton>
        <ToolButton label="Underline" title="Underline (Ctrl/⌘ U)" on={active.underline} onClick={() => run("underline")}><Underline className={icon} /></ToolButton>
        <ToolButton label="Strikethrough" on={active.strike} onClick={() => run("strikeThrough")}><Strikethrough className={icon} /></ToolButton>
        {divider}
        <ToolButton label="Bulleted list" on={active.ul} onClick={() => run("insertUnorderedList")}><List className={icon} /></ToolButton>
        <ToolButton label="Numbered list" on={active.ol} onClick={() => run("insertOrderedList")}><ListOrdered className={icon} /></ToolButton>
        <ToolButton label="Decrease indent" title="Decrease indent (Shift Tab, in a list)" disabled={!active.inList} onClick={() => run("outdent")}><IndentDecrease className={icon} /></ToolButton>
        <ToolButton label="Increase indent" title="Increase indent (Tab, in a list)" disabled={!active.inList} onClick={() => run("indent")}><IndentIncrease className={icon} /></ToolButton>
        {divider}
        <ToolButton label="Quote" on={active.quote} onClick={toggleQuote}><Quote className={icon} /></ToolButton>
        <ToolButton label={active.link ? "Remove link" : "Link"} title={active.link ? "Remove link" : "Add link (Ctrl/⌘ K)"} on={active.link} onClick={startLink}><Link2 className={icon} /></ToolButton>
        <ToolButton label="Clear formatting" onClick={clearFormatting}><RemoveFormatting className={icon} /></ToolButton>
      </div>

      {linkOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
          <Input
            autoFocus
            aria-label="Link address"
            placeholder="Paste or type a web address"
            value={linkText}
            aria-invalid={linkError}
            onChange={(e) => {
              setLinkText(e.target.value);
              setLinkError(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
              if (e.key === "Escape") setLinkOpen(false);
            }}
            className="h-8 min-w-48 flex-1 text-sm"
          />
          <Button type="button" size="sm" onClick={applyLink}>
            Add link
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setLinkOpen(false)}>
            Cancel
          </Button>
          {linkError && <p className="w-full text-xs text-destructive">That doesn&apos;t look like a web or email address.</p>}
        </div>
      )}

      <div className="relative">
        <div
          ref={editor}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={placeholder ?? "Note"}
          onInput={emit}
          onPaste={onPaste}
          onKeyDown={onKeyDown}
          style={{ minHeight: `${rows * 1.5 + 1}rem` }}
          className={cn(
            "w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none md:text-sm dark:bg-input/30",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            "[&_ul]:list-disc [&_ul_ul]:list-[circle] [&_ul_ul_ul]:list-[square] [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
            "[&_strong]:font-semibold [&_b]:font-semibold [&_a]:text-primary [&_a]:underline",
            "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
          )}
        />
        {empty && placeholder && <span className="pointer-events-none absolute top-2 left-2.5 text-base text-muted-foreground md:text-sm">{placeholder}</span>}
      </div>
    </div>
  );
}
